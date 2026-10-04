import * as listen from '../services/listenService.js';

export function registerListenHandlers(socket, on) {
  const { session } = socket.data;

  on('listen:get', async () => ({ room: listen.getListening(session) }));
  on('listen:start', async (data) => ({ room: await listen.startListening(session, socket.id, data) }));
  on('listen:join', async () => ({ room: listen.joinListening(session, socket.id) }));
  on('listen:control', async (data) => ({ room: listen.controlListening(session, socket.id, data) }));
  on('listen:ended', async (data) => ({ room: listen.songEnded(session, socket.id, data) }));
  on('listen:enqueue', async (data) => ({ room: await listen.enqueue(session, socket.id, data) }));
  on('listen:ring', async () => listen.ringPeer(session, socket.id));
  on('listen:leave', async () => listen.leaveListening(session, socket.id));

  socket.on('disconnect', () => listen.leaveListening(session, socket.id));
}
