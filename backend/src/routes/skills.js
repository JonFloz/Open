import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authJWT } from '../middleware/authJWT.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validate } from '../middleware/validate.js';
import {
  getSkill,
  installSkillFromUrl,
  listUserSkills,
  removeSkill,
  saveSkill,
} from '../services/skillManager.js';
import { listOpenCodeSkills, mapOpenCodeError } from '../services/opencodeClient.js';

const router = Router();
router.use(authJWT);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 256 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ok =
      /\.(md|markdown|json|txt)$/i.test(file.originalname) ||
      /^(text\/|application\/json)/.test(file.mimetype);
    if (!ok) {
      const error = new Error('Solo se permiten archivos .md, .markdown, .json o .txt');
      error.status = 415;
      return cb(error);
    }
    cb(null, true);
  },
});

const jsonSchema = z.object({
  name: z.string().trim().max(64).optional(),
  description: z.string().trim().max(400).optional(),
  content: z.string().min(1, 'El contenido es obligatorio').max(256 * 1024),
});

const installSchema = z.object({
  url: z.string().trim().url('URL inválida').max(2000),
  name: z.string().trim().max(64).optional(),
});

/** GET /api/skills — skills propias del usuario. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const includeContent = req.query.content === '1' || req.query.content === 'true';
    res.json({ skills: listUserSkills(req.user.id, { includeContent }) });
  }),
);

/** GET /api/skills/available — skills registradas en el servidor de OpenCode. */
router.get(
  '/available',
  asyncHandler(async (req, res) => {
    try {
      const skills = await listOpenCodeSkills();
      res.json({ skills: skills.map(({ content, ...rest }) => ({ ...rest, size: content?.length ?? 0 })) });
    } catch (error) {
      throw mapOpenCodeError(error);
    }
  }),
);

/** GET /api/skills/:id */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const skill = getSkill(req.user.id, req.params.id);
    if (!skill) return res.status(404).json({ error: { code: 'not_found', message: 'Skill no encontrada' } });
    res.json({ skill });
  }),
);

/** POST /api/skills — subida multipart o creación con JSON. */
router.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    let payload;
    if (req.file) {
      payload = {
        name: req.body?.name,
        description: req.body?.description,
        content: req.file.buffer.toString('utf8'),
        filename: req.file.originalname,
        source: 'upload',
      };
    } else {
      const parsed = jsonSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: {
            code: 'validation_error',
            message: 'Datos inválidos',
            details: parsed.error.issues.map((issue) => ({
              path: issue.path.join('.') || 'body',
              message: issue.message,
            })),
          },
        });
      }
      payload = { ...parsed.data, source: 'manual' };
    }

    const skill = saveSkill(req.user.id, payload);
    res.status(201).json({ skill });
  }),
);

/** POST /api/skills/install — instala una skill desde una URL. */
router.post(
  '/install',
  validate({ body: installSchema }),
  asyncHandler(async (req, res) => {
    const skill = await installSkillFromUrl(req.user.id, req.body.url, { name: req.body.name });
    res.status(201).json({ skill });
  }),
);

/** DELETE /api/skills/:id */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const removed = removeSkill(req.user.id, req.params.id);
    if (!removed) return res.status(404).json({ error: { code: 'not_found', message: 'Skill no encontrada' } });
    res.json({ ok: true });
  }),
);

export default router;
