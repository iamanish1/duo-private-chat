import { Server } from 'socket.io';
import { parseCookie } from 'cookie';
import { config } from '../config/env.js';
import { resolveSession } from '../services/authService.js';
import { SESSION_COOKIE } from '../middleware/auth.js';
import { isAllowedOrigin } from '../middleware/security.js';
import { logger } from '../utils/logger.js';
import { conversationRoom, setIO, userRoom } from './realtime.js';
import { createEventRegistrar } from './eventRegistrar.js';
import { registerPresenceHandlers } from './presenceHandlers.js';
import { registerMessageHandlers } from './messageHandlers.js';
import { registerCallHandlers } from './callHandlers.js';
import { registerWatchHandlers } from './watchHandlers.js';
import { registerListenHandlers } from './listenHandlers.js';

export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: config.clientOrigins.length ? { origin: config.clientOrigins, credentials: true } : undefined,
    // Detect dead mobile connections quickly so presence stays truthful.
    pingInterval: 10_000,
    pingTimeout: 8_000,
    maxHttpBufferSize: 256 * 1024,
    serveClient: false,
  });

  // Authenticate the handshake with the same HTTP-only cookie as the REST API.
  io.use(async (socket, next) => {
    try {
      const { headers } = socket.handshake;
      if (!isAllowedOrigin(headers.origin, headers.host)) throw Object.assign(new Error('Origin not allowed'), { code: 'ORIGIN_REJECTED' });
      const cookies = parseCookie(headers.cookie || '');
      socket.data.session = await resolveSession(cookies[SESSION_COOKIE]);
      socket.data.visible = false;
      next();
    } catch (err) {
      const error = new Error('unauthorized');
      error.data = { code: err.code || 'UNAUTHORIZED', message: err.status ? err.message : 'Please sign in again.' };
      next(error);
    }
  });

  io.on('connection', (socket) => {
    const { session } = socket.data;
    // Rooms are assigned by the server only; there is no client "join" event.
    socket.join([userRoom(session.user._id), conversationRoom(session.conversation._id)]);

    const on = createEventRegistrar(socket);
    registerMessageHandlers(socket, on);
    registerCallHandlers(socket, on);
    registerWatchHandlers(socket, on);
    registerListenHandlers(socket, on);
    registerPresenceHandlers(socket, on).catch((err) => logger.error('Presence setup failed', { message: err.message }));
  });

  setIO(io);
  return io;
}
