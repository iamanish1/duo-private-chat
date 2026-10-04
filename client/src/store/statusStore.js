import { create } from 'zustand';

const byCreated = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);

/** Both people's statuses from the last 24 hours, plus the open viewer. */
export const useStatusStore = create((set) => ({
  statuses: [],
  loaded: false,
  // { progress, kind } while a photo/video status uploads.
  uploading: null,
  // { ownerId, startId } while the full-screen viewer is open.
  viewer: null,

  setAll: (statuses) => set({ statuses: [...statuses].sort(byCreated), loaded: true }),
  upsert: (status) =>
    set((s) => ({ statuses: [...s.statuses.filter((x) => x.id !== status.id), status].sort(byCreated) })),
  remove: (id) => set((s) => ({ statuses: s.statuses.filter((x) => x.id !== id) })),
  setViewed: (id, viewedAt) =>
    set((s) => ({ statuses: s.statuses.map((x) => (x.id === id && !x.viewedAt ? { ...x, viewedAt } : x)) })),
  setUploading: (uploading) => set({ uploading }),
  openViewer: (ownerId, startId = null) => set({ viewer: { ownerId, startId } }),
  closeViewer: () => set({ viewer: null }),
}));

export const isLive = (status, now = Date.now()) => new Date(status.expiresAt).getTime() > now;
