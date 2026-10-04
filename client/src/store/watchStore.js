import { create } from 'zustand';

/**
 * Watch together. `room` mirrors the server's playback state; `clockOffset`
 * converts our clock to the server's so both players agree on "now".
 */
export const useWatchStore = create((set) => ({
  room: null,
  clockOffset: 0,
  joined: false,
  // { from, title, videoId } — the other person started watching.
  invite: null,
  inviteDismissed: false,
  reactions: [], // { id, emoji, mine, left }

  setRoom: (room) =>
    set((s) =>
      room ? { room, clockOffset: room.serverNow ? room.serverNow - Date.now() : s.clockOffset } : { room: null, joined: false },
    ),
  setJoined: (joined) => set({ joined }),
  setInvite: (invite) => set({ invite, inviteDismissed: false }),
  dismissInvite: () => set({ inviteDismissed: true }),
  addReaction: (reaction) => set((s) => ({ reactions: [...s.reactions.slice(-20), reaction] })),
  removeReaction: (id) => set((s) => ({ reactions: s.reactions.filter((r) => r.id !== id) })),
}));

/** Where playback should be right now, in seconds. */
export function expectedPosition(room, clockOffset) {
  if (!room) return 0;
  if (!room.playing) return room.position;
  return room.position + Math.max(0, Date.now() + clockOffset - room.updatedAt) / 1000;
}
