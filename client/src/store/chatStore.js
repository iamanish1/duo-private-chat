import { create } from 'zustand';
import { applyStatus, isPending, mergeMessages, upsertMessage } from '../utils/messageList';

const initialState = {
  me: null,
  peer: null,
  conversationId: null,
  messages: [],
  hasMore: false,
  status: 'idle', // idle | loading | ready | error
  error: null,
  loadingOlder: false,
  peerTyping: false,
  connection: 'connecting', // connecting | connected | reconnecting | offline
  uploads: {}, // clientId -> { progress, error }
  replyTo: null,
  editing: null, // own message being corrected in the composer
};

export const useChatStore = create((set) => ({
  ...initialState,

  reset: () => set(initialState),
  setBootstrap: ({ me, peer, conversation }) => set({ me, peer, conversationId: conversation.id, wallpaper: conversation.wallpaper ?? null }),
  // Shared chat background (both people see it, either can change it).
  setWallpaper: (wallpaper) => set({ wallpaper }),
  setStatus: (status, error = null) => set({ status, error }),
  setMessages: (messages, hasMore) => set((s) => ({ messages: mergeMessages(s.messages.filter(isPending), messages), hasMore })),
  prependOlder: (messages, hasMore) => set((s) => ({ messages: mergeMessages(s.messages, messages), hasMore, loadingOlder: false })),
  setLoadingOlder: (loadingOlder) => set({ loadingOlder }),
  upsert: (message) => set((s) => ({ messages: upsertMessage(s.messages, message) })),
  merge: (messages) => set((s) => ({ messages: mergeMessages(s.messages, messages) })),
  applyStatus: ({ ids, status, at }) => set((s) => ({ messages: applyStatus(s.messages, ids, status, at) })),
  patchByClientId: (clientId, patch) =>
    set((s) => ({ messages: s.messages.map((m) => (m.clientId === clientId ? { ...m, ...patch } : m)) })),
  removeByClientId: (clientId) => set((s) => ({ messages: s.messages.filter((m) => m.clientId !== clientId) })),

  setPeer: (patch) => set((s) => ({ peer: s.peer ? { ...s.peer, ...patch } : s.peer })),
  setMe: (patch) => set((s) => ({ me: s.me ? { ...s.me, ...patch } : s.me })),
  setPeerTyping: (peerTyping) => set({ peerTyping }),
  setConnection: (connection) => set({ connection }),
  // Replying and editing share the composer, so starting one ends the other.
  setReplyTo: (replyTo) => set({ replyTo, editing: null }),
  setEditing: (editing) => set({ editing, replyTo: null }),

  setUpload: (clientId, patch) => set((s) => ({ uploads: { ...s.uploads, [clientId]: { ...s.uploads[clientId], ...patch } } })),
  clearUpload: (clientId) =>
    set((s) => {
      const uploads = { ...s.uploads };
      delete uploads[clientId];
      return { uploads };
    }),
}));
