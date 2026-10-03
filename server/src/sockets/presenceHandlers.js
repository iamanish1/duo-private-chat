import { User } from '../models/index.js';
import { markDelivered } from '../services/messageService.js';
import { publishStatus } from '../services/messageEvents.js';
import { pendingIncomingCall } from '../services/callService.js';
import { publicUser } from '../services/serializers.js';
import { emitToUser, isUserOnline, socketsOfUser, userRoom } from './realtime.js';
import { alertOnCameOnline } from '../services/loginAlertService.js';
import { config } from '../config/env.js';

// Honors TRUST_PROXY like Express does for req.ip.
function clientIp(socket) {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (config.trustProxy > 0 && forwarded) {
    const chain = forwarded.split(',').map((s) => s.trim());
    return chain[Math.max(0, chain.length - config.trustProxy)] ?? socket.handshake.address;
  }
  return socket.handshake.address;
}

export async function registerPresenceHandlers(socket, on) {
  const { session } = socket.data;
  const userId = String(session.user._id);
  const peerId = String(session.peerId);

  on('presence:visibility', async ({ visible }) => {
    socket.data.visible = visible;
  });

  // Typing is throttled client-side; the server only relays to the peer.
  on('typing:start', async () => {
    socket.to(userRoom(peerId)).emit('typing:start', { userId });
  });
  on('typing:stop', async () => {
    socket.to(userRoom(peerId)).emit('typing:stop', { userId });
  });

  socket.on('disconnect', async () => {
    socket.to(userRoom(peerId)).emit('typing:stop', { userId });
    // Other tabs/devices may still be connected; only the last one flips presence.
    if ((await socketsOfUser(userId)).length > 0) return;
    const lastSeen = new Date();
    await User.updateOne({ _id: userId }, { $set: { isOnline: false, lastSeen } });
    emitToUser(peerId, 'user:offline', { userId, lastSeen });
  });

  // ---- Connection bootstrap -------------------------------------------------
  const [ownSockets, peerOnline, peer] = await Promise.all([
    socketsOfUser(userId),
    isUserOnline(peerId),
    User.findById(peerId).lean(),
  ]);
  if (ownSockets.length === 1) {
    // Must run before anything updates lastSeen.
    alertOnCameOnline(userId, { userAgent: socket.handshake.headers['user-agent'], ip: clientIp(socket) }).catch(() => {});
    await User.updateOne({ _id: userId }, { $set: { isOnline: true } });
    emitToUser(peerId, 'user:online', { userId });
  }
  socket.emit('presence:state', { peer: publicUser(peer, { isOnline: peerOnline }) });

  // Anything that arrived while this person was offline is now delivered.
  publishStatus(session, await markDelivered(session), 'delivered');

  // App opened from an incoming-call push: show the ringing screen.
  const pending = await pendingIncomingCall(session);
  if (pending) socket.emit('call:incoming', { call: pending, caller: publicUser(peer) });
}
