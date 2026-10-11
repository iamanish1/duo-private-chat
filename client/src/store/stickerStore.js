import { create } from 'zustand';

const RECENT_KEY = 'duo-recent-stickers';
const MAX_RECENT = 24;

const readRecent = () => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
  } catch {
    return [];
  }
};

// A stable id for "the same sticker" across kinds, for the Recent row.
export const stickerKey = (s) => (s.kind === 'emoji' ? `e:${s.code}` : s.kind === 'custom' ? `c:${s.id}` : `g:${s.id}`);

/** The shared sticker tray (made by either of you) and this device's recents. */
export const useStickerStore = create((set) => ({
  custom: [], // { id, url, width, height, createdBy }
  loaded: false,
  recent: readRecent(), // sticker inputs: { kind:'emoji', code } | { kind:'custom', id, url } | { kind:'gif', id, url, width, height, title }

  setCustom: (custom) => set({ custom, loaded: true }),
  addCustom: (sticker) => set((s) => ({ custom: [sticker, ...s.custom.filter((x) => x.id !== sticker.id)] })),
  removeCustom: (id) =>
    set((s) => {
      const recent = s.recent.filter((r) => !(r.kind === 'custom' && r.id === id));
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
      } catch {
        // optional
      }
      return { custom: s.custom.filter((x) => x.id !== id), recent };
    }),
  remember: (sticker) =>
    set((s) => {
      const recent = [sticker, ...s.recent.filter((r) => stickerKey(r) !== stickerKey(sticker))].slice(0, MAX_RECENT);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
      } catch {
        // Recents are a convenience.
      }
      return { recent };
    }),
}));
