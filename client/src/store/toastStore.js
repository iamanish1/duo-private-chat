import { create } from 'zustand';

let seq = 0;

export const useToastStore = create((set, get) => ({
  toasts: [],
  show: (message, { tone = 'neutral', duration = 3500, action } = {}) => {
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, tone, action }] }));
    if (duration) setTimeout(() => get().dismiss(id), duration);
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  show: (message, options) => useToastStore.getState().show(message, options),
  error: (message, options) => useToastStore.getState().show(message, { tone: 'danger', duration: 5000, ...options }),
  success: (message, options) => useToastStore.getState().show(message, { tone: 'success', ...options }),
};
