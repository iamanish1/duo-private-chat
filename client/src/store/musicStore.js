import { create } from 'zustand';

/**
 * Listen together: the shared song library and playlists, the live
 * listening session (`room`, mirrored from the server) and upload progress.
 */
export const useMusicStore = create((set) => ({
  songs: {}, // id -> song
  order: [], // song ids, newest first
  playlists: [],
  loaded: false,
  uploads: [], // { id, name, progress, error }

  room: null,
  clockOffset: 0,
  joined: false,
  invite: null, // { from, title, artist } — details from the invite event
  inviteDismissed: false,
  needsTap: false, // the browser refused to start audio by itself

  setLibrary: (songs, playlists) =>
    set({ songs: Object.fromEntries(songs.map((s) => [s.id, s])), order: songs.map((s) => s.id), playlists, loaded: true }),
  upsertSong: (song) =>
    set((s) => ({ songs: { ...s.songs, [song.id]: song }, order: s.order.includes(song.id) ? s.order : [song.id, ...s.order] })),
  removeSong: (id) =>
    set((s) => {
      const songs = { ...s.songs };
      delete songs[id];
      return { songs, order: s.order.filter((x) => x !== id), playlists: s.playlists.map((p) => ({ ...p, songIds: p.songIds.filter((x) => x !== id) })) };
    }),
  upsertPlaylist: (playlist) =>
    set((s) => ({ playlists: s.playlists.some((p) => p.id === playlist.id) ? s.playlists.map((p) => (p.id === playlist.id ? playlist : p)) : [...s.playlists, playlist] })),
  removePlaylist: (id) => set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) })),
  setUploads: (fn) => set((s) => ({ uploads: fn(s.uploads) })),

  setRoom: (room) =>
    set((s) => (room ? { room, clockOffset: room.serverNow ? room.serverNow - Date.now() : s.clockOffset } : { room: null, joined: false, needsTap: false })),
  setJoined: (joined) => set(joined ? { joined } : { joined, needsTap: false }),
  setInvite: (invite) => set({ invite, inviteDismissed: false }),
  dismissInvite: () => set({ inviteDismissed: true }),
  setNeedsTap: (needsTap) => set({ needsTap }),
}));

/** Where the shared song should be right now, in seconds. */
export function expectedPosition(room, clockOffset) {
  if (!room) return 0;
  if (!room.playing) return room.position;
  return room.position + Math.max(0, Date.now() + clockOffset - room.updatedAt) / 1000;
}

export const currentSong = (s) => (s.room ? s.songs[s.room.songId] ?? null : null);
