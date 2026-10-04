import * as watch from '../services/watchService.js';

export function registerWatchHandlers(socket, on) {
  const { session } = socket.data;

  on('watch:get', async () => ({ room: watch.getWatch(session) }));
  on('watch:start', async (data) => ({ room: await watch.startWatch(session, socket.id, data) }));
  on('watch:join', async () => ({ room: watch.joinWatch(session, socket.id) }));
  on('watch:control', async (data) => ({ room: watch.controlWatch(session, socket.id, data) }));
  on('watch:react', async (data) => watch.reactInWatch(session, socket.id, data));
  on('watch:ring', async () => watch.ringPeer(session, socket.id));
  on('watch:leave', async () => watch.leaveWatch(session, socket.id));

  socket.on('disconnect', () => watch.leaveWatch(session, socket.id));
}
