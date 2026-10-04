import { User } from '../models/index.js';
import { config } from '../config/env.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { emitToConversation, emitToUser, onScreenPushEndpoints } from '../sockets/realtime.js';
import { isPushEnabled, sendToUser } from './pushService.js';

// Watch together: one shared YouTube "room" per conversation. Playback state
// is small and short-lived, so it lives in memory; a restart simply ends the
// session. Clients sync to { position, playing, updatedAt } using serverNow.
const rooms = new Map(); // conversationId -> room
const EMPTY_ROOM_GRACE_MS = 2 * 60 * 1000; // survive reloads and brief disconnects
const MAX_POSITION = 24 * 60 * 60;

const key = (session) => String(session.conversation._id);
const uid = (session) => String(session.user._id);

export function roomState(room) {
  return {
    videoId: room.videoId,
    title: room.title,
    author: room.author,
    playing: room.playing,
    position: room.position,
    updatedAt: room.updatedAt,
    serverNow: Date.now(),
    changedBy: room.changedBy,
    startedBy: room.startedBy,
    members: [...room.members.keys()],
  };
}

const broadcast = (conversationId, room) => emitToConversation(conversationId, 'watch:state', roomState(room));

function addMember(room, userId, socketId) {
  clearTimeout(room.closeTimer);
  room.closeTimer = null;
  if (!room.members.has(userId)) room.members.set(userId, new Set());
  room.members.get(userId).add(socketId);
}

function scheduleCloseIfEmpty(conversationId, room) {
  if (room.members.size || room.closeTimer) return;
  room.closeTimer = setTimeout(() => {
    if (rooms.get(conversationId) !== room || room.members.size) return;
    rooms.delete(conversationId);
    emitToConversation(conversationId, 'watch:closed', {});
  }, EMPTY_ROOM_GRACE_MS);
  room.closeTimer.unref?.();
}

/** Title and channel from YouTube's public oEmbed endpoint (no API key). */
async function fetchVideoInfo(videoId) {
  if (config.isTest) return null;
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = await res.json();
    return { title: String(data.title || '').slice(0, 200), author: String(data.author_name || '').slice(0, 100) };
  } catch {
    return null;
  }
}

async function invitePeer(session, room) {
  const peerId = String(session.peerId);
  if (room.members.has(peerId)) return;
  emitToUser(peerId, 'watch:invite', { from: uid(session), ...roomState(room) });
  if (!isPushEnabled()) return;
  try {
    const skipEndpoints = await onScreenPushEndpoints(peerId);
    const recipient = await User.findById(peerId).select('settings').lean();
    const preview = recipient?.settings?.notificationPreview ?? 'sender';
    const what = preview === 'full' && room.title ? `: ${room.title}` : '';
    await sendToUser(
      peerId,
      {
        type: 'watch',
        tag: 'duo-watch',
        url: '/watch',
        title: preview === 'hidden' ? 'Watch together' : session.user.name,
        body: preview === 'hidden' ? 'You have an invite to watch together' : `Wants to watch together${what} 🍿`,
      },
      { urgency: 'high', topic: 'watch', ttl: 10 * 60, skipEndpoints },
    );
  } catch {
    logger.warn('Watch invite notification failed');
  }
}

/**
 * Starts watching a video together, or switches the video if a session is
 * already running. The starter joins; the other person gets an invite.
 */
export async function startWatch(session, socketId, { videoId }) {
  const conversationId = key(session);
  let room = rooms.get(conversationId);
  const now = Date.now();
  if (room) {
    Object.assign(room, { videoId, title: null, author: null, playing: true, position: 0, updatedAt: now, changedBy: uid(session) });
  } else {
    room = { videoId, title: null, author: null, playing: true, position: 0, updatedAt: now, changedBy: uid(session), startedBy: uid(session), members: new Map(), closeTimer: null };
    rooms.set(conversationId, room);
  }
  addMember(room, uid(session), socketId);
  broadcast(conversationId, room);

  // Details arrive a moment later; the invite waits for the title.
  fetchVideoInfo(videoId).then((info) => {
    if (rooms.get(conversationId) !== room || room.videoId !== videoId) return;
    if (info) Object.assign(room, info);
    if (info) broadcast(conversationId, room);
    invitePeer(session, room);
  });
  return roomState(room);
}

export function getWatch(session) {
  const room = rooms.get(key(session));
  return room ? roomState(room) : null;
}

export function joinWatch(session, socketId) {
  const conversationId = key(session);
  const room = rooms.get(conversationId);
  if (!room) throw notFound('Nothing is playing right now.', 'NO_WATCH');
  addMember(room, uid(session), socketId);
  broadcast(conversationId, room);
  return roomState(room);
}

function memberRoom(session, socketId) {
  const room = rooms.get(key(session));
  if (!room?.members.get(uid(session))?.has(socketId)) throw badRequest('Join the watch session first.', 'NOT_WATCHING');
  return room;
}

/** play / pause / seek from either person; last action wins. */
export function controlWatch(session, socketId, { action, position }) {
  const room = memberRoom(session, socketId);
  room.position = Math.min(Math.max(position, 0), MAX_POSITION);
  if (action === 'play') room.playing = true;
  if (action === 'pause') room.playing = false;
  room.updatedAt = Date.now();
  room.changedBy = uid(session);
  broadcast(key(session), room);
  return roomState(room);
}

export function reactInWatch(session, socketId, { emoji }) {
  memberRoom(session, socketId);
  emitToConversation(key(session), 'watch:reaction', { from: uid(session), emoji });
}

/** Re-sends the invite (and notification) to the other person. */
export async function ringPeer(session, socketId) {
  const room = memberRoom(session, socketId);
  await invitePeer(session, room);
}

export function leaveWatch(session, socketId) {
  const conversationId = key(session);
  const room = rooms.get(conversationId);
  const sockets = room?.members.get(uid(session));
  if (!sockets?.delete(socketId)) return;
  if (!sockets.size) room.members.delete(uid(session));
  broadcast(conversationId, room);
  scheduleCloseIfEmpty(conversationId, room);
}

export function resetWatchState() {
  for (const room of rooms.values()) clearTimeout(room.closeTimer);
  rooms.clear();
}
