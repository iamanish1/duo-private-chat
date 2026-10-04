// Watch together: room lifecycle, playback commands and reactions.
import { emit, emitWithAck } from './socket';
import { useWatchStore } from '../store/watchStore';
import { useChatStore } from '../store/chatStore';
import { toast } from '../store/toastStore';

const store = () => useWatchStore.getState();
const myId = () => useChatStore.getState().me?.id;
let reactionSeq = 0;

const inviteFrom = (room) => ({ from: room.from ?? room.startedBy, title: room.title, videoId: room.videoId });

/** Starts a session with this video, or switches the video for both. */
export async function startWatching(videoId) {
  try {
    const { room } = await emitWithAck('watch:start', { videoId });
    store().setRoom(room);
    store().setJoined(true);
    store().setInvite(null);
    return true;
  } catch (err) {
    toast.error(err.code === 'DISCONNECTED' ? "You're offline. Try again when you're connected." : err.message);
    return false;
  }
}

/** Joins whatever is playing; false when nothing is. */
export async function joinWatching() {
  try {
    const { room } = await emitWithAck('watch:join', {});
    store().setRoom(room);
    store().setJoined(true);
    store().setInvite(null);
    return true;
  } catch (err) {
    if (err.code === 'NO_WATCH') store().setRoom(null);
    return false;
  }
}

export function leaveWatching() {
  if (store().joined) emit('watch:leave', {});
  store().setJoined(false);
  store().dismissInvite(); // we just left; don't invite us straight back
}

/** On (re)connect: learn whether a session is running, and rejoin ours. */
export async function refreshWatch() {
  try {
    if (store().joined) {
      await joinWatching();
      return;
    }
    const { room } = await emitWithAck('watch:get', {});
    store().setRoom(room);
    const me = myId();
    if (room && me && room.members.length && !room.members.includes(me)) store().setInvite(inviteFrom(room));
    else if (!room) store().setInvite(null);
  } catch {
    // Not connected yet; the next connect tries again.
  }
}

/** play / pause / seek from this device; applied locally at once. */
export function sendControl(action, position) {
  const { room, clockOffset } = store();
  if (!room) return;
  const playing = action === 'play' ? true : action === 'pause' ? false : room.playing;
  store().setRoom({ ...room, position, playing, updatedAt: Date.now() + clockOffset, serverNow: undefined, changedBy: myId() });
  emitWithAck('watch:control', { action, position: Math.max(0, position) })
    .then(({ room: confirmed }) => store().setRoom(confirmed))
    .catch(() => {});
}

export function ringPartner() {
  emitWithAck('watch:ring', {})
    .then(() => toast.show('Invite sent'))
    .catch((err) => toast.error(err.message));
}

function showReaction(emoji, mine) {
  const id = ++reactionSeq;
  store().addReaction({ id, emoji, mine, left: 6 + Math.random() * 30 + (mine ? 54 : 0) });
  setTimeout(() => store().removeReaction(id), 2700);
}

export function sendReaction(emoji) {
  showReaction(emoji, true);
  emit('watch:react', { emoji });
}

export const watchSocketHandlers = {
  'watch:state': (room) => {
    const prev = store().room;
    store().setRoom(room);
    const me = myId();
    if (store().joined || !me) return;
    // A session we're not in: offer to join (and keep the title up to date).
    if (room.members.length && !room.members.includes(me)) {
      if (!store().invite || prev?.videoId !== room.videoId || !store().invite.title) store().setInvite(inviteFrom(room));
    } else if (!room.members.length) store().setInvite(null);
  },
  'watch:invite': (invite) => {
    if (store().joined) return;
    store().setRoom(invite);
    store().setInvite(inviteFrom(invite));
  },
  'watch:reaction': ({ from, emoji }) => {
    if (from !== myId()) showReaction(emoji, false);
  },
  'watch:closed': () => {
    store().setRoom(null);
    store().setInvite(null);
  },
};
