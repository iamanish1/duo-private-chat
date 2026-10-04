import { Song, User } from '../models/index.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { emitToConversation, emitToUser, onScreenPushEndpoints } from '../sockets/realtime.js';
import { isPushEnabled, sendToUser } from './pushService.js';
import { existingSongIds } from './musicService.js';

// Listen together: one shared queue per conversation, kept in memory like
// Watch together. Clients play the current song from
// position + (serverNow - updatedAt) and follow every change.
const rooms = new Map(); // conversationId -> room
const EMPTY_ROOM_GRACE_MS = 5 * 60 * 1000;
const MAX_QUEUE = 1000;
const RESTART_THRESHOLD_S = 3; // "previous" after this restarts the song instead
export const REPEAT_MODES = ['off', 'all', 'one'];

const key = (session) => String(session.conversation._id);
const uid = (session) => String(session.user._id);

export function roomState(room) {
  return {
    queue: room.queue,
    index: room.index,
    songId: room.queue[room.index] ?? null,
    playing: room.playing,
    position: room.position,
    updatedAt: room.updatedAt,
    serverNow: Date.now(),
    repeat: room.repeat,
    playlistId: room.playlistId,
    changedBy: room.changedBy,
    startedBy: room.startedBy,
    members: [...room.members.keys()],
  };
}

const broadcast = (conversationId, room) => emitToConversation(conversationId, 'listen:state', roomState(room));

function addMember(room, userId, socketId) {
  clearTimeout(room.closeTimer);
  room.closeTimer = null;
  if (!room.members.has(userId)) room.members.set(userId, new Set());
  room.members.get(userId).add(socketId);
}

function closeRoom(conversationId) {
  const room = rooms.get(conversationId);
  if (!room) return;
  clearTimeout(room.closeTimer);
  rooms.delete(conversationId);
  emitToConversation(conversationId, 'listen:closed', {});
}

function scheduleCloseIfEmpty(conversationId, room) {
  if (room.members.size || room.closeTimer) return;
  room.closeTimer = setTimeout(() => {
    if (rooms.get(conversationId) === room && !room.members.size) closeRoom(conversationId);
  }, EMPTY_ROOM_GRACE_MS);
  room.closeTimer.unref?.();
}

function setTrack(room, index, session) {
  room.index = index;
  room.position = 0;
  room.updatedAt = Date.now();
  room.changedBy = uid(session);
}

async function invitePeer(session, room) {
  const peerId = String(session.peerId);
  if (room.members.has(peerId)) return;
  const song = await Song.findById(room.queue[room.index]).select('title artist').lean();
  emitToUser(peerId, 'listen:invite', { from: uid(session), title: song?.title ?? null, artist: song?.artist ?? '', ...roomState(room) });
  if (!isPushEnabled()) return;
  try {
    const skipEndpoints = await onScreenPushEndpoints(peerId);
    const recipient = await User.findById(peerId).select('settings').lean();
    const preview = recipient?.settings?.notificationPreview ?? 'sender';
    const what = preview === 'full' && song?.title ? ` “${song.title}”` : '';
    await sendToUser(
      peerId,
      {
        type: 'listen',
        tag: 'duo-listen',
        url: '/music',
        title: preview === 'hidden' ? 'Listen together' : session.user.name,
        body: preview === 'hidden' ? 'You have an invite to listen together' : `Is listening to${what || ' music'} — tap to listen together 🎧`,
      },
      { urgency: 'high', topic: 'listen', ttl: 10 * 60, skipEndpoints },
    );
  } catch {
    logger.warn('Listen invite notification failed');
  }
}

/** Plays a queue (the library or a playlist) from `index`, replacing what was on. */
export async function startListening(session, socketId, { songIds, index = 0, playlistId = null }) {
  const queue = (await existingSongIds(session, songIds)).slice(0, MAX_QUEUE);
  if (!queue.length) throw badRequest('Those songs are no longer in your library.', 'SONG_NOT_FOUND');
  const conversationId = key(session);
  const start = Math.min(index, queue.length - 1);
  let room = rooms.get(conversationId);
  if (!room) {
    room = { repeat: 'all', startedBy: uid(session), members: new Map(), closeTimer: null };
    rooms.set(conversationId, room);
  }
  Object.assign(room, { queue, playlistId, playing: true });
  setTrack(room, start, session);
  addMember(room, uid(session), socketId);
  broadcast(conversationId, room);
  invitePeer(session, room).catch(() => {});
  return roomState(room);
}

export function getListening(session) {
  const room = rooms.get(key(session));
  return room ? roomState(room) : null;
}

export function joinListening(session, socketId) {
  const room = rooms.get(key(session));
  if (!room) throw notFound('Nothing is playing right now.', 'NO_LISTEN');
  addMember(room, uid(session), socketId);
  broadcast(key(session), room);
  return roomState(room);
}

function memberRoom(session, socketId) {
  const room = rooms.get(key(session));
  if (!room?.members.get(uid(session))?.has(socketId)) throw badRequest('Join the music first.', 'NOT_LISTENING');
  return room;
}

function advance(room, session) {
  if (room.index < room.queue.length - 1) setTrack(room, room.index + 1, session);
  else if (room.repeat === 'all') setTrack(room, 0, session);
  else {
    // End of the queue: stop on the last song.
    room.playing = false;
    room.position = 0;
    room.updatedAt = Date.now();
    room.changedBy = uid(session);
  }
}

/** play / pause / seek / next / prev / jump / repeat — last action wins. */
export function controlListening(session, socketId, { action, position = 0, index, repeat }) {
  const room = memberRoom(session, socketId);
  const now = Date.now();
  switch (action) {
    case 'play':
    case 'pause':
    case 'seek':
      room.position = Math.max(0, position);
      if (action !== 'seek') room.playing = action === 'play';
      room.updatedAt = now;
      room.changedBy = uid(session);
      break;
    case 'next': {
      // Skipping starts the next song playing; at the very end (repeat off) it stops.
      const atEnd = room.index === room.queue.length - 1 && room.repeat !== 'all';
      advance(room, session);
      if (!atEnd) room.playing = true;
      break;
    }
    case 'prev':
      if (position > RESTART_THRESHOLD_S || room.index === 0) setTrack(room, room.index, session);
      else setTrack(room, room.index - 1, session);
      break;
    case 'jump':
      if (index == null || index >= room.queue.length) throw badRequest('That song is not in the queue.', 'BAD_INDEX');
      setTrack(room, index, session);
      room.playing = true;
      break;
    case 'repeat':
      room.repeat = repeat;
      room.changedBy = uid(session);
      break;
    default:
      throw badRequest('Unknown action.', 'BAD_ACTION');
  }
  broadcast(key(session), room);
  return roomState(room);
}

/**
 * A device finished song `index`. Both devices report it; only the first
 * report for the current song moves on (the second carries a stale index).
 */
export function songEnded(session, socketId, { index }) {
  const room = memberRoom(session, socketId);
  if (index !== room.index || !room.playing) return roomState(room);
  if (room.repeat === 'one') setTrack(room, room.index, session);
  else advance(room, session);
  broadcast(key(session), room);
  return roomState(room);
}

export async function enqueue(session, socketId, { songId }) {
  const room = memberRoom(session, socketId);
  const [id] = await existingSongIds(session, [songId]);
  if (!id) throw notFound('That song is no longer in your library.', 'SONG_NOT_FOUND');
  if (room.queue.length >= MAX_QUEUE) throw badRequest('The queue is full.', 'QUEUE_FULL');
  room.queue = [...room.queue, id];
  room.changedBy = uid(session);
  broadcast(key(session), room);
  return roomState(room);
}

/** A song was deleted from the library: drop it from the live queue too. */
export function forgetSong(conversationId, songId) {
  const room = rooms.get(String(conversationId));
  if (!room || !room.queue.includes(songId)) return;
  const current = room.queue[room.index];
  const before = room.queue.slice(0, room.index).filter((id) => id === songId).length;
  room.queue = room.queue.filter((id) => id !== songId);
  if (!room.queue.length) {
    closeRoom(String(conversationId));
    return;
  }
  room.index = Math.min(room.index - before, room.queue.length - 1);
  if (current === songId) {
    room.position = 0;
    room.updatedAt = Date.now();
  }
  broadcast(String(conversationId), room);
}

export async function ringPeer(session, socketId) {
  await invitePeer(session, memberRoom(session, socketId));
}

export function leaveListening(session, socketId) {
  const conversationId = key(session);
  const room = rooms.get(conversationId);
  const sockets = room?.members.get(uid(session));
  if (!sockets?.delete(socketId)) return;
  if (!sockets.size) room.members.delete(uid(session));
  broadcast(conversationId, room);
  scheduleCloseIfEmpty(conversationId, room);
}

export function resetListenState() {
  for (const room of rooms.values()) clearTimeout(room.closeTimer);
  rooms.clear();
}
