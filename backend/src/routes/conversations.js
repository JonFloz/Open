import { Router } from 'express';
import { z } from 'zod';
import {
  addMessage,
  createConversation,
  deleteConversation,
  findConversation,
  getMessages,
  listConversations,
  publicConversation,
  renameConversation,
} from '../db/conversations.js';
import { authJWT } from '../middleware/authJWT.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validate } from '../middleware/validate.js';
import { mapOpenCodeError, removeSession } from '../services/opencodeClient.js';

const router = Router();
router.use(authJWT);

const createSchema = z.object({
  title: z.string().trim().max(120).optional(),
  model: z.string().trim().max(200).nullable().optional(),
  agent: z.string().trim().max(80).nullable().optional(),
});

const renameSchema = z.object({ title: z.string().trim().min(1).max(120) });

/** GET /api/conversations */
router.get('/', (req, res) => {
  res.json({ conversations: listConversations(req.user.id) });
});

/** POST /api/conversations */
router.post(
  '/',
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const conversation = createConversation(req.user.id, req.body ?? {});
    res.status(201).json({ conversation: publicConversation(conversation) });
  }),
);

/** GET /api/conversations/:id — conversación + historial de mensajes. */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const conversation = findConversation(req.user.id, req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Conversación no encontrada' } });
    }
    res.json({
      conversation: publicConversation(conversation),
      messages: getMessages(req.user.id, conversation.id),
    });
  }),
);

/** PATCH /api/conversations/:id */
router.patch(
  '/:id',
  validate({ body: renameSchema }),
  asyncHandler(async (req, res) => {
    const conversation = renameConversation(req.user.id, req.params.id, req.body.title);
    if (!conversation) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Conversación no encontrada' } });
    }
    res.json({ conversation: publicConversation(conversation) });
  }),
);

/** DELETE /api/conversations/:id */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const conversation = findConversation(req.user.id, req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Conversación no encontrada' } });
    }
    if (conversation.opencode_session_id) {
      try {
        await removeSession(conversation.opencode_session_id);
      } catch (error) {
        // Si OpenCode no responde, la conversación local se borra igual.
        const mapped = mapOpenCodeError(error);
        if (mapped.status !== 404) console.warn('[conversations] no se pudo borrar la sesión remota:', mapped.message);
      }
    }
    deleteConversation(req.user.id, conversation.id);
    res.json({ ok: true });
  }),
);

/** POST /api/conversations/:id/messages — guarda un mensaje manual (p. ej. de error). */
router.post(
  '/:id/messages',
  validate({
    body: z.object({
      role: z.enum(['user', 'assistant', 'system', 'error']),
      content: z.string().max(200_000),
      reasoning: z.string().max(200_000).nullable().optional(),
      model: z.string().max(200).nullable().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const conversation = findConversation(req.user.id, req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Conversación no encontrada' } });
    }
    const message = addMessage(conversation.id, req.body);
    res.status(201).json({ message });
  }),
);

export default router;
