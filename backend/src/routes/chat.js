import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import config from '../config.js';
import { defaultApiKeyRow, findApiKeyRow, revealApiKey } from '../db/apiKeys.js';
import {
  addMessage,
  attachOpenCodeSession,
  createConversation,
  findConversation,
  publicConversation,
  publicMessage,
} from '../db/conversations.js';
import { getSettings } from '../db/settings.js';
import { authJWT } from '../middleware/authJWT.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { chatLimiter } from '../middleware/rateLimiter.js';
import { promptSchema, validate } from '../middleware/validate.js';
import { ensureUserCredential } from '../services/credentials.js';
import { eventHub } from '../services/eventHub.js';
import {
  createSession,
  humanizeError,
  interrupt,
  listMessages,
  mapOpenCodeError,
  prompt as sendPrompt,
  switchAgent,
  switchModel,
} from '../services/opencodeClient.js';
import { getSkill } from '../services/skillManager.js';
import { endSse, initSse, keepAlive, sendSse } from '../services/sse.js';

const router = Router();
router.use(authJWT);

const MAX_TITLE = 60;

function deriveTitle(text) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (!clean) return 'Nueva conversación';
  return clean.length > MAX_TITLE ? `${clean.slice(0, MAX_TITLE - 1)}…` : clean;
}

/** Guarda la imagen en /data/uploads/<user> y devuelve su ruta absoluta. */
function storeUpload(userId, image) {
  const match = /^data:(?<mime>[^;]+);base64,(?<data>.*)$/s.exec(image.data ?? '');
  const mime = image.mimeType ?? match?.groups?.mime ?? 'image/png';
  if (!config.allowedImageMime.includes(mime)) {
    const error = new Error(`Tipo de imagen no permitido: ${mime}`);
    error.status = 415;
    throw error;
  }
  const base64 = match?.groups?.data ?? image.data;
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.byteLength === 0) {
    const error = new Error('Imagen vacía');
    error.status = 400;
    throw error;
  }
  if (buffer.byteLength > config.maxUploadBytes) {
    const error = new Error(`La imagen supera el límite de ${config.maxUploadBytes / (1024 * 1024)} MB`);
    error.status = 413;
    throw error;
  }

  const dir = path.join(config.uploadsDir, String(userId).replace(/[^a-zA-Z0-9_-]/g, '_'));
  fs.mkdirSync(dir, { recursive: true });
  const ext = mime.split('/')[1]?.replace('+xml', '') ?? 'png';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const target = path.join(dir, filename);
  fs.writeFileSync(target, buffer);

  return {
    absolutePath: target,
    relativePath: path.relative(config.dataDir, target),
    mime,
    name: image.name ?? filename,
    bytes: buffer.byteLength,
    dataUri: match ? image.data : `data:${mime};base64,${base64}`,
  };
}

/** Extrae el texto y el razonamiento del último mensaje del asistente. */
function extractAssistant(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.type !== 'assistant') continue;
    const parts = Array.isArray(message.content) ? message.content : [];
    const text = parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('');
    const reasoning = parts
      .filter((part) => part.type === 'reasoning')
      .map((part) => part.text)
      .join('\n');
    const tools = parts
      .filter((part) => part.type === 'tool')
      .map((part) => ({ name: part.name ?? part.tool ?? 'tool', state: part.state?.status ?? part.state?._tag ?? null }));
    return { text, reasoning, tools, id: message.id, model: message.model, finish: message.finish, error: message.error };
  }
  return null;
}

// ---------------------------------------------------------------------------
// POST /api/chat — streaming SSE
// ---------------------------------------------------------------------------
router.post(
  '/',
  chatLimiter,
  validate({ body: promptSchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { prompt: text, conversationId, model, agent, skillIds, images, apiKeyId } = req.body;

    // 1. Contexto del usuario -------------------------------------------------
    const settings = getSettings(userId);
    const chosenModel = model ?? settings.default_model ?? config.opencode.defaultModel;
    const chosenAgent = agent ?? settings.default_agent ?? config.opencode.defaultAgent;

    let conversation = conversationId ? findConversation(userId, conversationId) : null;
    if (!conversation) {
      conversation = createConversation(userId, { title: deriveTitle(text), model: chosenModel, agent: chosenAgent });
    }

    // 2. Credencial del usuario (si guardó una API key propia) ----------------
    const keyRow = apiKeyId ? findApiKeyRow(userId, apiKeyId) : defaultApiKeyRow(userId);
    let credentialWarning = null;
    if (keyRow) {
      const result = await ensureUserCredential({ userId, apiKey: revealApiKey(keyRow) });
      if (!result.applied) credentialWarning = `No se pudo activar tu API key (${result.reason}); se usará la del servidor.`;
    }

    // 3. Sesión de OpenCode ---------------------------------------------------
    let opencodeSessionId = conversation.opencode_session_id;
    let createdSession = false;
    if (!opencodeSessionId) {
      const session = await createSession({
        title: conversation.title,
        model: chosenModel,
        agent: chosenAgent,
      });
      opencodeSessionId = session.id;
      attachOpenCodeSession(conversation.id, opencodeSessionId);
      createdSession = true;
    } else if (chosenModel) {
      await switchModel(opencodeSessionId, chosenModel);
    }
    if (chosenAgent && !createdSession) {
      await switchAgent(opencodeSessionId, chosenAgent).catch(() => {});
    }

    // 4. Adjuntos -------------------------------------------------------------
    const stored = (images ?? []).map((image) => storeUpload(userId, image));
    const files = stored.map((item) => ({ uri: item.dataUri, name: item.name, description: item.relativePath }));

    // 5. Skills seleccionadas -------------------------------------------------
    const skills = (skillIds ?? [])
      .map((id) => getSkill(userId, id))
      .filter(Boolean)
      .map((skill) => ({ id: skill.name }));

    // 6. Persistimos el mensaje del usuario -----------------------------------
    const userMessage = addMessage(conversation.id, {
      role: 'user',
      content: text,
      model: chosenModel,
      meta: {
        images: stored.map((item) => ({ name: item.name, path: item.relativePath, mime: item.mime })),
        skills: skills.map((skill) => skill.id),
      },
    });

    // 7. Nos suscribimos ANTES de lanzar el prompt para no perder deltas ------
    const buffered = [];
    const bufferedListener = (event) => {
      if (event?.data?.sessionID === opencodeSessionId) buffered.push(event);
    };
    let activeListener = bufferedListener;
    eventHub.on('event', bufferedListener);

    let acknowledgement;
    try {
      acknowledgement = await sendPrompt({ sessionID: opencodeSessionId, text, files, skills });
    } catch (error) {
      eventHub.off('event', bufferedListener);
      throw mapOpenCodeError(error);
    }

    // 8. A partir de aquí ya emitimos SSE -------------------------------------
    initSse(res);
    let finished = false;
    let assistantText = '';
    let assistantReasoning = '';
    const tools = [];
    const controller = new AbortController();

    const finish = (event, payload) => {
      if (finished) return;
      finished = true;
      eventHub.off('event', activeListener);
      controller.abort();
      clearInterval(heartbeat);
      sendSse(res, event, payload);
      endSse(res);
    };

    req.on('close', () => {
      if (!finished) {
        finished = true;
        eventHub.off('event', activeListener);
        controller.abort();
        clearInterval(heartbeat);
      }
    });

    const heartbeat = setInterval(() => keepAlive(res), 15000);
    res.on('close', () => clearInterval(heartbeat));

    sendSse(res, 'meta', {
      conversation: publicConversation(conversation),
      message: userMessage,
      sessionId: opencodeSessionId,
      model: chosenModel,
      agent: chosenAgent,
      acknowledgement: acknowledgement?.id ?? null,
      warning: credentialWarning,
    });

    const push = (event) => {
      const data = event.data ?? {};
      switch (event.type) {
        case 'session.text.delta':
          assistantText += data.delta ?? '';
          sendSse(res, 'delta', { text: data.delta ?? '', messageId: data.assistantMessageID });
          break;
        case 'session.reasoning.delta':
          assistantReasoning += data.delta ?? '';
          sendSse(res, 'reasoning', { text: data.delta ?? '' });
          break;
        case 'session.tool.called':
        case 'session.tool.input.ended': {
          const entry = { name: data.tool ?? data.name ?? 'tool', status: 'running', input: data.input ?? null };
          tools.push(entry);
          sendSse(res, 'tool', entry);
          break;
        }
        case 'session.tool.success': {
          sendSse(res, 'tool', { name: data.tool ?? data.name ?? 'tool', status: 'success', output: data.output ?? null });
          break;
        }
        case 'session.tool.failed': {
          sendSse(res, 'tool', { name: data.tool ?? data.name ?? 'tool', status: 'error', error: data.error ?? null });
          break;
        }
        case 'session.step.started':
          sendSse(res, 'status', { state: 'thinking', model: data.model ?? null });
          break;
        case 'session.retry.scheduled':
          sendSse(res, 'status', { state: 'retrying', attempt: data.attempt ?? null });
          break;
        case 'session.execution.failed':
        case 'session.step.failed':
          sendSse(res, 'error', {
            code: 'execution_failed',
            message: humanizeError(data.error?.message ?? 'La ejecución falló'),
          });
          break;
        default:
          break;
      }
    };

    // Volcamos lo que llegó entre el prompt y el encabezado SSE.
    eventHub.off('event', bufferedListener);
    for (const event of buffered) push(event);
    buffered.length = 0;

    activeListener = (event) => {
      if (event?.data?.sessionID !== opencodeSessionId) return;
      push(event);
      if (
        event.type === 'session.execution.succeeded' ||
        event.type === 'session.idle' ||
        event.type === 'session.execution.failed' ||
        event.type === 'session.execution.interrupted'
      ) {
        void finalize(event);
      }
    };
    eventHub.on('event', activeListener);

    async function finalize(event) {
      try {
        if (event.type === 'session.execution.interrupted') {
          return finish('error', { code: 'interrupted', message: 'Ejecución interrumpida' });
        }
        const messages = await listMessages(opencodeSessionId);
        const assistant = extractAssistant(messages);
        const content = assistant?.text || assistantText;
        const reasoning = assistant?.reasoning || assistantReasoning;

        if (!content && !reasoning) {
          if (event.type === 'session.execution.failed') {
            return finish('error', {
              code: 'execution_failed',
              message: humanizeError(event.data?.error?.message ?? 'OpenCode no devolvió contenido'),
            });
          }
          return finish('error', { code: 'empty_response', message: 'OpenCode no devolvió contenido' });
        }

        const saved = addMessage(conversation.id, {
          role: 'assistant',
          content,
          reasoning: reasoning || null,
          model: assistant?.model ? `${assistant.model.providerID}/${assistant.model.id}` : chosenModel,
          meta: { tools, finish: assistant?.finish ?? null, opencodeMessageId: assistant?.id ?? null },
        });

        finish('done', { message: publicMessage(saved), model: chosenModel });
      } catch (error) {
        const mapped = mapOpenCodeError(error);
        finish('error', { code: mapped.code, message: mapped.message });
      }
    }
  }),
);

// ---------------------------------------------------------------------------
// POST /api/chat/stop
// ---------------------------------------------------------------------------
router.post(
  '/stop',
  asyncHandler(async (req, res) => {
    const { conversationId } = req.body ?? {};
    const conversation = conversationId ? findConversation(req.user.id, conversationId) : null;
    if (!conversation?.opencode_session_id) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Conversación no encontrada' } });
    }
    try {
      await interrupt(conversation.opencode_session_id);
      res.json({ ok: true });
    } catch (error) {
      throw mapOpenCodeError(error);
    }
  }),
);

export default router;
