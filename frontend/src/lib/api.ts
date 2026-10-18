import type { ApiError } from './types';

/**
 * Base de la API.
 * - En producción el backend sirve el frontend, así que es el mismo origen ('').
 * - En desarrollo, Next corre en :3000 y Express en :3001 → NEXT_PUBLIC_API_BASE.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

const TOKEN_KEY = 'owc.token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiRequestError extends Error implements ApiError {
  code: string;
  status: number;
  details?: unknown;

  constructor(error: ApiError, status: number) {
    super(error.message);
    this.name = 'ApiRequestError';
    this.code = error.code;
    this.status = status;
    this.details = error.details;
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function parse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Petición JSON a la API con manejo uniforme de errores. */
export async function api<T>(
  path: string,
  options: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
      ...authHeaders(),
      ...(headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  const payload = await parse(response);
  if (!response.ok) {
    const error: ApiError =
      payload && typeof payload === 'object' && 'error' in payload
        ? (payload as { error: ApiError }).error
        : { code: 'http_error', message: `Error HTTP ${response.status}` };
    throw new ApiRequestError(error, response.status);
  }
  return payload as T;
}

export type StreamEvent =
  | { type: 'meta'; data: Record<string, unknown> }
  | { type: 'delta'; data: { text: string } }
  | { type: 'reasoning'; data: { text: string } }
  | { type: 'tool'; data: { name: string; status?: string } }
  | { type: 'status'; data: { state: string } }
  | { type: 'done'; data: { message: import('./types').ChatMessage; model: string } }
  | { type: 'error'; data: ApiError };

/**
 * Envía un prompt y consume la respuesta en streaming (SSE sobre `fetch`).
 * Usamos fetch en lugar de EventSource para poder mandar el header
 * Authorization y hacer un POST con cuerpo.
 */
export async function streamChat(
  body: Record<string, unknown>,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const payload = await parse(response);
    const error: ApiError =
      payload && typeof payload === 'object' && 'error' in payload
        ? (payload as { error: ApiError }).error
        : { code: 'http_error', message: `Error HTTP ${response.status}` };
    onEvent({ type: 'error', data: error });
    return;
  }

  if (!response.body) {
    onEvent({ type: 'error', data: { code: 'no_body', message: 'Respuesta sin cuerpo' } });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handleChunk = (chunk: string) => {
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of chunk.split('\n')) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) return;
    let data: unknown;
    try {
      data = JSON.parse(dataLines.join('\n'));
    } catch {
      return;
    }
    onEvent({ type: eventName, data } as StreamEvent);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf('\n\n');
    while (index !== -1) {
      const chunk = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      if (chunk.trim()) handleChunk(chunk);
      index = buffer.indexOf('\n\n');
    }
  }
  if (buffer.trim()) handleChunk(buffer);
}

/** Sube una skill como multipart/form-data. */
export async function uploadSkill(file: File): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${API_BASE}/api/skills`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  if (!response.ok) {
    const payload = await parse(response);
    const error: ApiError =
      payload && typeof payload === 'object' && 'error' in payload
        ? (payload as { error: ApiError }).error
        : { code: 'http_error', message: `Error HTTP ${response.status}` };
    throw new ApiRequestError(error, response.status);
  }
}

export default api;
