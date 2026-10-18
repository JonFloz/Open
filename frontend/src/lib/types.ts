export interface User {
  id: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  theme: 'light' | 'dark' | 'system';
  defaultModel: string | null;
  defaultAgent: string | null;
  defaultApiKeyId: string | null;
}

export interface ApiKey {
  id: string;
  label: string;
  provider: string;
  masked: string;
  isDefault: boolean;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  model: string | null;
  agent: string | null;
  opencodeSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  reasoning?: string | null;
  model?: string | null;
  meta?: {
    images?: { name: string; path: string; mime: string }[];
    skills?: string[];
    tools?: { name: string; status?: string }[];
    finish?: string | null;
    [key: string]: unknown;
  } | null;
  createdAt: string;
  /** Solo en el cliente: la respuesta aún se está generando. */
  streaming?: boolean;
}

export interface ModelInfo {
  id: string;
  modelID: string;
  providerID: string;
  name: string;
  family: string | null;
  variants: string[];
  capabilities?: { tools?: boolean; input?: string[]; output?: string[] } | null;
}

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  mode: string;
}

export interface CommandInfo {
  name: string;
  description?: string;
}

export interface ModelsResponse {
  models: ModelInfo[];
  agents: AgentInfo[];
  commands: CommandInfo[];
  defaultModel: string | null;
  defaultAgent: string | null;
  fetchedAt: string;
  cached: boolean;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  filename: string;
  source: string;
  size: number;
  createdAt: string;
  content?: string;
}

export interface ServerStatus {
  connected: boolean;
  server: {
    baseUrl: string | null;
    managed: boolean;
    ready: boolean;
    version: string | null;
    startedAt: string | null;
    error: string | null;
    pid: number | null;
  };
  events: { status: string; subscribers: number; connections: number; lastEventAt: string | null };
  directory: string;
  defaultModel: string | null;
  defaultAgent: string | null;
  error: string | null;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  retryAfter?: string | null;
}

export interface ChatStreamMeta {
  conversation: Conversation;
  message: ChatMessage;
  sessionId: string;
  model: string;
  agent: string;
  warning?: string | null;
}
