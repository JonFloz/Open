import { EventEmitter } from 'node:events';
import { getClient } from './opencodeClient.js';

/**
 * Hub de eventos del servidor de OpenCode.
 *
 * Mantiene UNA sola suscripción al stream SSE del servidor y reparte los
 * eventos entre todos los interesados (las peticiones de chat abiertas).
 * Así no abrimos una conexión SSE por usuario.
 */
class EventHub extends EventEmitter {
  #running = false;
  #controller = null;
  #status = 'idle';
  #lastEventAt = null;
  #connections = 0;

  get status() {
    return {
      status: this.#status,
      subscribers: this.listenerCount('event'),
      connections: this.#connections,
      lastEventAt: this.#lastEventAt,
    };
  }

  start() {
    if (this.#running) return;
    this.#running = true;
    this.#status = 'connecting';
    void this.#loop();
  }

  async stop() {
    this.#running = false;
    this.#status = 'stopped';
    this.#controller?.abort();
    this.#controller = null;
  }

  async #loop() {
    while (this.#running) {
      this.#controller = new AbortController();
      try {
        const client = await getClient();
        this.#connections += 1;
        this.#status = 'connected';
        for await (const event of client.event.subscribe({ signal: this.#controller.signal })) {
          this.#lastEventAt = new Date().toISOString();
          this.emit('event', event);
        }
        this.#status = 'disconnected';
      } catch (error) {
        if (!this.#running) break;
        this.#status = 'error';
        this.emit('error', error);
      }
      if (!this.#running) break;
      // Reintento con espera: el servidor puede estar arrancando o reiniciándose.
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    this.#status = 'stopped';
  }

  /**
   * Espera el final de la ejecución de una sesión.
   * @param {string} sessionID
   * @param {{signal?: AbortSignal, timeout?: number}} options
   */
  waitForSession(sessionID, { signal, timeout = 10 * 60 * 1000 } = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Se agotó el tiempo de espera de la respuesta del agente'));
      }, timeout);

      const cleanup = () => {
        clearTimeout(timer);
        this.off('event', onEvent);
        signal?.removeEventListener('abort', onAbort);
      };

      const onAbort = () => {
        cleanup();
        reject(new Error('aborted'));
      };

      const onEvent = (event) => {
        if (event?.data?.sessionID !== sessionID) return;
        if (event.type === 'session.execution.succeeded' || event.type === 'session.idle') {
          cleanup();
          resolve(event);
        } else if (
          event.type === 'session.execution.failed' ||
          event.type === 'session.step.failed'
        ) {
          cleanup();
          resolve(event);
        } else if (event.type === 'session.execution.interrupted') {
          cleanup();
          resolve(event);
        }
      };

      signal?.addEventListener('abort', onAbort, { once: true });
      this.on('event', onEvent);
    });
  }
}

export const eventHub = new EventHub();
export default eventHub;
