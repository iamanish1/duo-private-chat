// Listen together: library, playlists and the shared listening session.
import { api } from './api';
import { emit, emitWithAck } from './socket';
import { expectedPosition, useMusicStore } from '../store/musicStore';
import { getAudio } from './audioElement';
import { useChatStore } from '../store/chatStore';
import { toast } from '../store/toastStore';

const store = () => useMusicStore.getState();
const myId = () => useChatStore.getState().me?.id;
const body = (promise) => promise.then((res) => res.data);
let uploadSeq = 0;

// ---- Library ------------------------------------------------------------------
export async function loadLibrary() {
  try {
    const { songs, playlists } = await body(api.get('/music'));
    store().setLibrary(songs, playlists);
  } catch {
    // Retried on the next reconnect.
  }
}

/** Uploads songs one after another, with a progress row each. */
export async function uploadSongs(files) {
  const jobs = Array.from(files).map((file) => ({ id: ++uploadSeq, file, name: file.name, progress: 0, error: null }));
  store().setUploads((list) => [...list, ...jobs.map(({ file, ...job }) => job)]);
  let added = 0;
  for (const job of jobs) {
    const form = new FormData();
    form.append('file', job.file, job.file.name);
    try {
      const { song } = await body(
        api.post('/music/songs', form, {
          timeout: 0,
          onUploadProgress: (e) => e.total && store().setUploads((list) => list.map((u) => (u.id === job.id ? { ...u, progress: e.loaded / e.total } : u))),
        }),
      );
      store().upsertSong(song);
      store().setUploads((list) => list.filter((u) => u.id !== job.id));
      added += 1;
    } catch (err) {
      store().setUploads((list) => list.map((u) => (u.id === job.id ? { ...u, error: err.message } : u)));
    }
  }
  if (added) toast.show(added === 1 ? 'Song added' : `${added} songs added`);
}

export const dismissUpload = (id) => store().setUploads((list) => list.filter((u) => u.id !== id));

async function run(promise, apply) {
  try {
    const result = await body(promise);
    apply?.(result);
    return result;
  } catch (err) {
    toast.error(err.message);
    return null;
  }
}

export const editSong = (id, changes) => run(api.patch(`/music/songs/${id}`, changes), ({ song }) => store().upsertSong(song));
export const deleteSong = (id) => run(api.delete(`/music/songs/${id}`), () => store().removeSong(id));
export const createPlaylist = (name) => run(api.post('/music/playlists', { name }), ({ playlist }) => store().upsertPlaylist(playlist));
export const renamePlaylist = (id, name) => run(api.patch(`/music/playlists/${id}`, { name }), ({ playlist }) => store().upsertPlaylist(playlist));
export const deletePlaylist = (id) => run(api.delete(`/music/playlists/${id}`), () => store().removePlaylist(id));
export const addToPlaylist = (id, songId) => run(api.post(`/music/playlists/${id}/songs`, { songId }), ({ playlist }) => store().upsertPlaylist(playlist));
export const removeFromPlaylist = (id, songId) =>
  run(api.delete(`/music/playlists/${id}/songs/${songId}`), ({ playlist }) => store().upsertPlaylist(playlist));

/** Moves a song up/down; shown at once, rolled back if the server refuses. */
export async function moveInPlaylist(id, from, to) {
  const playlist = store().playlists.find((p) => p.id === id);
  if (!playlist || to < 0 || to >= playlist.songIds.length) return;
  const songIds = [...playlist.songIds];
  const [moved] = songIds.splice(from, 1);
  songIds.splice(to, 0, moved);
  store().upsertPlaylist({ ...playlist, songIds });
  const ok = await run(api.patch(`/music/playlists/${id}`, { songIds }), ({ playlist: saved }) => store().upsertPlaylist(saved));
  if (!ok) store().upsertPlaylist(playlist);
}

// ---- Listening session ---------------------------------------------------------
/** Plays these songs (library or a playlist) from `index` — for both of you. */
export async function playSongs(songIds, index = 0, playlistId = null) {
  try {
    const { room } = await emitWithAck('listen:start', { songIds, index, playlistId });
    store().setRoom(room);
    store().setJoined(true);
    store().setInvite(null);
  } catch (err) {
    toast.error(err.code === 'DISCONNECTED' ? "You're offline. Try again when you're connected." : err.message);
  }
}

export function shuffled(ids) {
  const list = [...ids];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export async function joinListening() {
  try {
    const { room } = await emitWithAck('listen:join', {});
    store().setRoom(room);
    store().setJoined(true);
    store().setInvite(null);
    return true;
  } catch (err) {
    if (err.code === 'NO_LISTEN') store().setRoom(null);
    toast.error(err.code === 'NO_LISTEN' ? 'The music has stopped.' : err.message);
    return false;
  }
}

export function leaveListening() {
  if (store().joined) emit('listen:leave', {});
  store().setJoined(false);
  store().dismissInvite(); // we just stopped; don't invite us straight back
}

/** play / pause / seek / next / prev / jump / repeat, applied here at once. */
export function control(action, extra = {}) {
  const { room, clockOffset } = store();
  if (!room || !store().joined) return;
  if (action === 'play' || action === 'pause' || action === 'seek') {
    const playing = action === 'seek' ? room.playing : action === 'play';
    store().setRoom({ ...room, playing, position: extra.position ?? room.position, updatedAt: Date.now() + clockOffset, serverNow: undefined, changedBy: myId() });
  }
  emitWithAck('listen:control', { action, ...extra })
    .then(({ room: confirmed }) => store().setRoom(confirmed))
    .catch((err) => toast.error(err.message));
}

/**
 * Play resumes from the shared position (exact even right after a seek);
 * pause keeps exactly where this device's player is.
 */
export function togglePlay() {
  const { room, clockOffset } = store();
  if (!room) return;
  if (room.playing) control('pause', { position: getAudio()?.currentTime ?? expectedPosition(room, clockOffset) });
  else control('play', { position: expectedPosition(room, clockOffset) });
}

export const currentPosition = () => getAudio()?.currentTime ?? expectedPosition(store().room, store().clockOffset);

export function reportEnded(index) {
  emitWithAck('listen:ended', { index })
    .then(({ room }) => store().setRoom(room))
    .catch(() => {});
}

export function enqueue(songId) {
  emitWithAck('listen:enqueue', { songId })
    .then(({ room }) => {
      store().setRoom(room);
      toast.show('Added to the queue');
    })
    .catch((err) => toast.error(err.message));
}

export function ringPartner() {
  emitWithAck('listen:ring', {})
    .then(() => toast.show('Invite sent'))
    .catch((err) => toast.error(err.message));
}

/** On (re)connect: rejoin our session, or learn about theirs. */
export async function refreshListening() {
  loadLibrary();
  try {
    if (store().joined) {
      const { room } = await emitWithAck('listen:join', {});
      store().setRoom(room);
      return;
    }
    const { room } = await emitWithAck('listen:get', {});
    store().setRoom(room);
    const me = myId();
    if (room && me && room.members.length && !room.members.includes(me)) store().setInvite({ from: room.startedBy });
    else if (!room) store().setInvite(null);
  } catch (err) {
    if (err.code === 'NO_LISTEN') store().setRoom(null);
  }
}

export const musicSocketHandlers = {
  'music:song': (song) => store().upsertSong(song),
  'music:song-removed': ({ id }) => store().removeSong(id),
  'music:playlist': (playlist) => store().upsertPlaylist(playlist),
  'music:playlist-removed': ({ id }) => store().removePlaylist(id),
  'listen:state': (room) => {
    store().setRoom(room);
    const me = myId();
    if (store().joined || !me) return;
    if (room.members.length && !room.members.includes(me)) {
      if (!store().invite) store().setInvite({ from: room.startedBy });
    } else if (!room.members.length) store().setInvite(null);
  },
  'listen:invite': (invite) => {
    if (store().joined) return;
    store().setRoom(invite);
    store().setInvite({ from: invite.from, title: invite.title, artist: invite.artist });
  },
  'listen:closed': () => {
    store().setRoom(null);
    store().setInvite(null);
  },
};
