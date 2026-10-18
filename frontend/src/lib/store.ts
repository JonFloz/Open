'use client';

import { create } from 'zustand';
import {
  ApiRequestError,
  api,
  getToken,
  setToken,
  streamChat,
  uploadSkill,
  type StreamEvent,
} from './api';
import type {
  AgentInfo,
  ApiKey,
  ChatMessage,
  CommandInfo,
  Conversation,
  ModelInfo,
  ServerStatus,
  Settings,
  Skill,
  User,
} from './types';

export type ToastKind = 'info' | 'success' | 'error' | 'warning';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface StoreState {
  // Sesión
  ready: boolean;
  user: User | null;
  settings: Settings | null;

  // Chat
  conversations: Conversation[];
  currentId: string | null;
  messages: ChatMessage[];
  loadingConversation: boolean;

  // Capacidades
  models: ModelInfo[];
  agents: AgentInfo[];
  commands: CommandInfo[];
  defaultModel: string | null;
  defaultAgent: string | null;
  selectedModel: string | null;
  selectedAgent: string | null;
  loadingModels: boolean;

  skills: Skill[];
  opencodeSkills: Skill[];
  apiKeys: ApiKey[];

  // Streaming
  streaming: boolean;
  streamError: string | null;

  // UI
  sidebarOpen: boolean;
  theme: 'light' | 'dark' | 'system';
  serverStatus: ServerStatus | null;
  toasts: Toast[];

  // Acciones
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;

  loadConversations: () => Promise<void>;
  loadWorkspace: () => Promise<void>;
  openConversation: (id: string) => Promise<void>;
  restoreConversation: () => Promise<void>;
  newConversation: () => void;
  removeConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;

  loadModels: () => Promise<void>;
  loadSkills: () => Promise<void>;
  loadApiKeys: () => Promise<void>;
  createApiKey: (input: { label: string; provider: string; key: string }) => Promise<void>;
  removeApiKey: (id: string) => Promise<void>;
  setDefaultApiKey: (id: string) => Promise<void>;
  verifyApiKey: (id: string) => Promise<void>;
  uploadSkillFile: (file: File) => Promise<void>;
  installSkillFromUrl: (url: string) => Promise<void>;
  removeSkill: (id: string) => Promise<void>;

  sendPrompt: (
    text: string,
    images?: { data: string; name: string; mimeType: string }[],
    skillIds?: string[],
  ) => Promise<void>;
  stopStreaming: () => Promise<void>;
  clearMessages: () => void;

  setModel: (model: string | null, agent?: string | null) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  refreshServerStatus: () => Promise<void>;
  setSidebarOpen: (open: boolean) => void;
  toast: (message: string, kind?: ToastKind) => void;
  dismissToast: (id: string) => void;
}

let abortController: AbortController | null = null;
let streamedConversationId: string | null = null;

/** Conversación abierta, para restaurarla en la siguiente visita. */
const CONVERSATION_KEY = 'owc.conversation';

const ERROR_MESSAGES: Record<string, string> = {
  no_token: 'Tu sesión no es válida. Vuelve a iniciar sesión.',
  token_expired: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  invalid_credentials: 'Email o contraseña incorrectos.',
  rate_limited: 'Demasiadas peticiones. Espera unos segundos.',
};

function describeError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return ERROR_MESSAGES[error.code] ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Ocurrió un error inesperado';
}

export const useStore = create<StoreState>((set, get) => ({
  ready: false,
  user: null,
  settings: null,

  conversations: [],
  currentId: null,
  messages: [],
  loadingConversation: false,

  models: [],
  agents: [],
  commands: [],
  defaultModel: null,
  defaultAgent: null,
  selectedModel: null,
  selectedAgent: null,
  loadingModels: false,

  skills: [],
  opencodeSkills: [],
  apiKeys: [],

  streaming: false,
  streamError: null,

  sidebarOpen: false,
  theme: 'system',
  serverStatus: null,
  toasts: [],

  // -------------------------------------------------------------------------
  toast: (message, kind = 'info') => {
    const id = Math.random().toString(36).slice(2);
    set((state) => ({ toasts: [...state.toasts, { id, kind, message }] }));
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 8000 : 4500);
  },

  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

  // -------------------------------------------------------------------------
  bootstrap: async () => {
    const savedTheme = (localStorage.getItem('owc.theme') as StoreState['theme']) ?? 'system';
    const sidebarOpen = localStorage.getItem('owc.sidebar') === 'open';
    set({ theme: savedTheme, sidebarOpen });

    if (!getToken()) {
      set({ ready: true });
      return;
    }
    try {
      const { user, settings } = await api<{ user: User; settings: Settings }>('/api/auth/me');
      set({ user, settings, theme: settings.theme, ready: true });
      applyTheme(settings.theme);
      await get().loadWorkspace();
      await get().restoreConversation();
    } catch {
      setToken(null);
      set({ ready: true, user: null });
    }
  },

  login: async (email, password) => {
    const { user, settings, token } = await api<{ user: User; settings: Settings; token: string }>(
      '/api/auth/login',
      { method: 'POST', json: { email, password } },
    );
    setToken(token);
    set({ user, settings, theme: settings.theme });
    applyTheme(settings.theme);
    await get().loadWorkspace();
  },

  register: async (email, password) => {
    const { user, settings, token } = await api<{ user: User; settings: Settings; token: string }>(
      '/api/auth/register',
      { method: 'POST', json: { email, password } },
    );
    setToken(token);
    set({ user, settings, theme: settings.theme });
    applyTheme(settings.theme);
    await get().loadWorkspace();
  },

  logout: async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* la sesión local se cierra igual */
    }
    setToken(null);
    localStorage.removeItem(CONVERSATION_KEY);
    set({
      user: null,
      settings: null,
      conversations: [],
      currentId: null,
      messages: [],
      apiKeys: [],
      skills: [],
    });
  },

  // -------------------------------------------------------------------------
  loadConversations: async () => {
    const { conversations } = await api<{ conversations: Conversation[] }>('/api/conversations');
    set({ conversations });
  },

  /**
   * Carga todo lo que necesita la UI tras autenticarse: conversaciones,
   * modelos/agentes, skills, API keys y el estado del servidor.
   */
  loadWorkspace: async () => {
    await Promise.all([
      get().loadConversations(),
      get().loadModels(),
      get().loadSkills(),
      get().loadApiKeys(),
    ]);
    await get().refreshServerStatus();
  },

  openConversation: async (id) => {
    set({ loadingConversation: true, currentId: id, streamError: null });
    localStorage.setItem(CONVERSATION_KEY, id);
    try {
      const { conversation, messages } = await api<{ conversation: Conversation; messages: ChatMessage[] }>(
        `/api/conversations/${id}`,
      );
      set({ messages, selectedModel: conversation.model ?? get().selectedModel });
    } catch (error) {
      get().toast(describeError(error), 'error');
    } finally {
      set({ loadingConversation: false });
    }
  },

  /** Reabre la última conversación visitada (por ejemplo tras recargar). */
  restoreConversation: async () => {
    const id = localStorage.getItem(CONVERSATION_KEY);
    if (!id) return;
    if (!get().conversations.some((conversation) => conversation.id === id)) {
      localStorage.removeItem(CONVERSATION_KEY);
      return;
    }
    await get().openConversation(id);
  },

  newConversation: () => {
    localStorage.removeItem(CONVERSATION_KEY);
    set({ currentId: null, messages: [], streamError: null });
  },

  removeConversation: async (id) => {
    await api(`/api/conversations/${id}`, { method: 'DELETE' });
    if (localStorage.getItem(CONVERSATION_KEY) === id) localStorage.removeItem(CONVERSATION_KEY);
    set((state) => ({
      conversations: state.conversations.filter((conversation) => conversation.id !== id),
      ...(state.currentId === id ? { currentId: null, messages: [] } : {}),
    }));
    get().toast('Conversación eliminada', 'success');
  },

  renameConversation: async (id, title) => {
    const { conversation } = await api<{ conversation: Conversation }>(`/api/conversations/${id}`, {
      method: 'PATCH',
      json: { title },
    });
    set((state) => ({
      conversations: state.conversations.map((item) => (item.id === id ? conversation : item)),
    }));
  },

  // -------------------------------------------------------------------------
  loadModels: async () => {
    set({ loadingModels: true });
    try {
      const data = await api<{
        models: ModelInfo[];
        agents: AgentInfo[];
        commands: CommandInfo[];
        defaultModel: string | null;
        defaultAgent: string | null;
      }>('/api/models');
      const stored = localStorage.getItem('owc.model');
      const storedAgent = localStorage.getItem('owc.agent');
      set({
        models: data.models,
        agents: data.agents,
        commands: data.commands,
        defaultModel: data.defaultModel,
        defaultAgent: data.defaultAgent,
        selectedModel: stored ?? get().selectedModel ?? data.defaultModel,
        selectedAgent: storedAgent ?? get().selectedAgent ?? data.defaultAgent,
      });
    } catch (error) {
      get().toast(`No se pudieron cargar los modelos: ${describeError(error)}`, 'warning');
    } finally {
      set({ loadingModels: false });
    }
  },

  loadSkills: async () => {
    const [{ skills }, available] = await Promise.all([
      api<{ skills: Skill[] }>('/api/skills'),
      api<{ skills: Skill[] }>('/api/skills/available').catch(() => ({ skills: [] as Skill[] })),
    ]);
    set({ skills, opencodeSkills: available.skills });
  },

  loadApiKeys: async () => {
    const { keys, settings } = await api<{ keys: ApiKey[]; settings: Settings }>('/api/keys');
    set({ apiKeys: keys, settings });
  },

  createApiKey: async (input) => {
    const result = await api<{
      key: ApiKey;
      credential?: { applied: boolean; integrationID: string | null; warning: string | null };
    }>('/api/keys', { method: 'POST', json: input });

    await get().loadApiKeys();

    if (result.credential?.applied) {
      get().toast(`API key cifrada y activada en OpenCode (${result.credential.integrationID})`, 'success');
    } else {
      get().toast(result.credential?.warning ?? 'API key guardada, pero OpenCode no la aceptó', 'warning');
    }

    // Al activar la credencial OpenCode publica nuevos modelos: refrescamos.
    await get().loadModels();
  },

  removeApiKey: async (id) => {
    await api(`/api/keys/${id}`, { method: 'DELETE' });
    await get().loadApiKeys();
    await get().loadModels();
    get().toast('API key eliminada', 'success');
  },

  setDefaultApiKey: async (id) => {
    await api(`/api/keys/${id}/default`, { method: 'POST' });
    await get().loadApiKeys();
    await get().loadModels();
  },

  verifyApiKey: async (id) => {
    try {
      const result = await api<{ ok: boolean; verified: boolean; message?: string; warning?: string }>(
        `/api/keys/${id}/verify`,
        { method: 'POST' },
      );
      if (result.verified) get().toast(result.message ?? 'La API key funciona con OpenCode', 'success');
      else get().toast(result.warning ?? 'API key registrada, sin comprobar', 'warning');
    } catch (error) {
      get().toast(describeError(error), 'error');
    }
  },

  uploadSkillFile: async (file) => {
    await uploadSkill(file);
    await get().loadSkills();
    get().toast(`Skill "${file.name}" subida`, 'success');
  },

  installSkillFromUrl: async (url) => {
    await api('/api/skills/install', { method: 'POST', json: { url } });
    await get().loadSkills();
    get().toast('Skill instalada desde la URL', 'success');
  },

  removeSkill: async (id) => {
    await api(`/api/skills/${id}`, { method: 'DELETE' });
    await get().loadSkills();
    get().toast('Skill eliminada', 'success');
  },

  // -------------------------------------------------------------------------
  sendPrompt: async (text, images, skillIds) => {
    if (get().streaming) return;
    const promptText = text.trim();
    if (!promptText && !images?.length) return;

    const conversationId = get().currentId;
    const localUserId = `local-user-${Date.now()}`;
    const localAssistantId = `local-assistant-${Date.now()}`;

    set((state) => ({
      streamError: null,
      streaming: true,
      messages: [
        ...state.messages,
        {
          id: localUserId,
          role: 'user',
          content: promptText,
          createdAt: new Date().toISOString(),
          meta: images?.length ? { images: images.map((image) => ({ name: image.name, path: '', mime: image.mimeType })) } : null,
        },
        {
          id: localAssistantId,
          role: 'assistant',
          content: '',
          reasoning: '',
          model: state.selectedModel,
          createdAt: new Date().toISOString(),
          streaming: true,
        },
      ],
    }));
    abortController = new AbortController();
    streamedConversationId = conversationId;

    const patchAssistant = (patch: Partial<ChatMessage>) =>
      set((state) => ({
        messages: state.messages.map((message) =>
          message.id === localAssistantId ? { ...message, ...patch } : message,
        ),
      }));

    const handle = (event: StreamEvent) => {
      switch (event.type) {
        case 'meta': {
          const data = event.data as {
            conversation: Conversation;
            warning?: string | null;
          };
          set((state) => ({
            currentId: data.conversation.id,
            conversations: state.conversations.some((item) => item.id === data.conversation.id)
              ? state.conversations
              : [data.conversation, ...state.conversations],
          }));
          localStorage.setItem(CONVERSATION_KEY, data.conversation.id);
          streamedConversationId = data.conversation.id;
          if (data.warning) get().toast(data.warning, 'warning');
          break;
        }
        case 'delta':
          set((state) => ({
            messages: state.messages.map((message) =>
              message.id === localAssistantId
                ? { ...message, content: message.content + event.data.text }
                : message,
            ),
          }));
          break;
        case 'reasoning':
          set((state) => ({
            messages: state.messages.map((message) =>
              message.id === localAssistantId
                ? { ...message, reasoning: (message.reasoning ?? '') + event.data.text }
                : message,
            ),
          }));
          break;
        case 'tool':
          set((state) => ({
            messages: state.messages.map((message) =>
              message.id === localAssistantId
                ? {
                    ...message,
                    meta: {
                      ...(message.meta ?? {}),
                      tools: [...((message.meta?.tools as { name: string }[]) ?? []), { name: event.data.name, status: event.data.status }],
                    },
                  }
                : message,
            ),
          }));
          break;
        case 'done': {
          const saved = event.data.message;
          set((state) => ({
            messages: state.messages.map((message) =>
              message.id === localAssistantId ? { ...saved, streaming: false } : message,
            ),
          }));
          break;
        }
        case 'error':
          set((state) => ({
            streamError: event.data.message,
            messages: state.messages.map((message) =>
              message.id === localAssistantId
                ? {
                    ...message,
                    streaming: false,
                    content: message.content || `⚠️ ${event.data.message}`,
                  }
                : message,
            ),
          }));
          get().toast(event.data.message, 'error');
          break;
        default:
          break;
      }
    };

    try {
      await streamChat(
        {
          prompt: promptText,
          conversationId,
          model: get().selectedModel,
          agent: get().selectedAgent,
          apiKeyId: get().settings?.defaultApiKeyId ?? null,
          images: images?.length ? images : undefined,
          skillIds: skillIds?.length ? skillIds : undefined,
        },
        handle,
        abortController.signal,
      );
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        handle({ type: 'error', data: { code: 'network_error', message: describeError(error) } });
      }
    } finally {
      patchAssistant({ streaming: false });
      abortController = null;
      set({ streaming: false });
      await get().loadConversations().catch(() => undefined);
    }
  },

  stopStreaming: async () => {
    const conversationId = streamedConversationId ?? get().currentId;
    abortController?.abort();
    abortController = null;
    set({ streaming: false });
    if (conversationId) {
      try {
        await api('/api/chat/stop', { method: 'POST', json: { conversationId } });
      } catch {
        /* el agente ya había terminado */
      }
    }
  },

  clearMessages: () => {
    set({ messages: [], currentId: null, streamError: null });
    get().toast('Historial local limpiado', 'success');
  },

  // -------------------------------------------------------------------------
  setModel: (model, agent) => {
    if (model) localStorage.setItem('owc.model', model);
    if (agent) localStorage.setItem('owc.agent', agent);
    set({
      selectedModel: model ?? get().selectedModel,
      selectedAgent: agent ?? get().selectedAgent,
    });
    void api('/api/settings', {
      method: 'PATCH',
      json: { defaultModel: model ?? null, ...(agent ? { defaultAgent: agent } : {}) },
    }).catch(() => undefined);
  },

  setTheme: (theme) => {
    localStorage.setItem('owc.theme', theme);
    set({ theme });
    applyTheme(theme);
    void api('/api/settings', { method: 'PATCH', json: { theme } }).catch(() => undefined);
  },

  refreshServerStatus: async () => {
    try {
      const status = await api<ServerStatus>('/api/status');
      set({ serverStatus: status });
    } catch {
      set({ serverStatus: null });
    }
  },

  setSidebarOpen: (open) => {
    localStorage.setItem('owc.sidebar', open ? 'open' : 'closed');
    set({ sidebarOpen: open });
  },
}));

/** Aplica el tema al documento (clase `dark`). */
export function applyTheme(theme: 'light' | 'dark' | 'system') {
  if (typeof document === 'undefined') return;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}
