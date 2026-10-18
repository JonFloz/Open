/**
 * Utilidades mínimas para Server-Sent Events (SSE).
 */

/** Prepara la respuesta para transmitir SSE. */
export function initSse(res, { retry = 3000 } = {}) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Evita el buffering de proxies/compresores intermedios.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write(`retry: ${retry}\n\n`);
}

/** Envía un evento SSE con nombre y payload JSON. */
export function sendSse(res, event, data) {
  if (res.writableEnded) return false;
  const payload = JSON.stringify(data ?? {});
  res.write(`event: ${event}\ndata: ${payload}\n\n`);
  return true;
}

/** Comentario SSE para mantener viva la conexión. */
export function keepAlive(res) {
  if (res.writableEnded) return;
  res.write(': keep-alive\n\n');
}

/** Cierra el stream de forma ordenada. */
export function endSse(res) {
  if (!res.writableEnded) res.end();
}

export default { initSse, sendSse, keepAlive, endSse };
