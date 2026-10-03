import { io } from 'socket.io-client';
import { API_BASE } from '../config';

let socket = null;

/** One shared, cookie-authenticated connection; reconnects with backoff. */
export function getSocket() {
  if (!socket) {
    socket = io(API_BASE || undefined, {
      withCredentials: true,
      autoConnect: false,
      reconnectionDelay: 800,
      reconnectionDelayMax: 8000,
      randomizationFactor: 0.4,
    });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
}

/** Emits with an acknowledgement; resolves the server's {ok, ...} payload. */
export function emitWithAck(event, payload, timeout = 10_000) {
  const s = getSocket();
  return new Promise((resolve, reject) => {
    if (!s.connected) {
      reject(Object.assign(new Error('Not connected'), { code: 'DISCONNECTED' }));
      return;
    }
    s.timeout(timeout).emit(event, payload, (err, response) => {
      if (err) reject(Object.assign(new Error('The server did not respond in time.'), { code: 'TIMEOUT' }));
      else if (!response?.ok) reject(Object.assign(new Error(response?.error?.message || 'Something went wrong.'), { code: response?.error?.code }));
      else resolve(response);
    });
  });
}

export const emit = (event, payload) => getSocket().connected && getSocket().emit(event, payload);
