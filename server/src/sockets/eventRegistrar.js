import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { parseOrThrow } from '../middleware/validate.js';
import { socketSchemas } from '../validators/schemas.js';

const BUCKET_CAPACITY = 120;
const REFILL_PER_SECOND = 20;

/**
 * Returns `on(event, handler)` that validates payloads, rate-limits per
 * socket, enforces session expiry, and answers acks with {ok, ...}|{ok:false, error}.
 */
export function createEventRegistrar(socket) {
  let tokens = BUCKET_CAPACITY;
  let lastRefill = Date.now();

  const allow = () => {
    const now = Date.now();
    tokens = Math.min(BUCKET_CAPACITY, tokens + ((now - lastRefill) / 1000) * REFILL_PER_SECOND);
    lastRefill = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };

  return function on(event, handler) {
    socket.on(event, async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (Date.now() > socket.data.session.expiresAt) {
        socket.emit('session:expired', {});
        socket.disconnect(true);
        return;
      }
      if (!allow()) {
        reply({ ok: false, error: { code: 'RATE_LIMITED', message: 'You are going a little fast. Please slow down.' } });
        return;
      }
      try {
        const data = socketSchemas[event] ? parseOrThrow(socketSchemas[event], payload) : undefined;
        const result = await handler(data);
        reply({ ok: true, ...result });
      } catch (err) {
        if (!(err instanceof AppError)) logger.error(`Socket handler failed: ${event}`, { message: err.message });
        reply({
          ok: false,
          error: err instanceof AppError
            ? { code: err.code, message: err.message }
            : { code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' },
        });
      }
    });
  };
}
