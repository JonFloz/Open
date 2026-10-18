import { Router } from 'express';
import { z } from 'zod';
import { getSettings, publicSettings, updateSettings } from '../db/settings.js';
import { authJWT } from '../middleware/authJWT.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();
router.use(authJWT);

const themeSchema = z.enum(['light', 'dark', 'system']);

const updateSchema = z.object({
  theme: themeSchema.optional(),
  defaultModel: z.string().trim().max(200).nullable().optional(),
  defaultAgent: z.string().trim().max(80).nullable().optional(),
  defaultApiKeyId: z.string().trim().max(80).nullable().optional(),
});

/** GET /api/settings */
router.get('/', (req, res) => {
  res.json({ settings: publicSettings(getSettings(req.user.id)) });
});

/** PATCH /api/settings */
router.patch(
  '/',
  validate({ body: updateSchema }),
  asyncHandler(async (req, res) => {
    const settings = updateSettings(req.user.id, req.body);
    res.json({ settings: publicSettings(settings) });
  }),
);

export default router;
