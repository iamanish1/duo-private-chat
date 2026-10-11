// "Thinking of you" taps, days together & countdowns, shared lists.
import { create } from 'zustand';
import { api } from './api';
import { toast } from '../store/toastStore';
import { useChatStore } from '../store/chatStore';

const body = (p) => p.then((r) => r.data);

export const useCloseStore = create((set) => ({
  together: { since: null, events: [] },
  togetherLoaded: false,
  lists: [],
  listsLoaded: false,
  hearts: 0, // bumps to play the floating-hearts animation

  setTogether: (together) => set({ together, togetherLoaded: true }),
  setLists: (lists) => set({ lists, listsLoaded: true }),
  upsertList: (list) => set((s) => ({ lists: s.lists.some((l) => l.id === list.id) ? s.lists.map((l) => (l.id === list.id ? list : l)) : [...s.lists, list] })),
  removeList: (id) => set((s) => ({ lists: s.lists.filter((l) => l.id !== id) })),
  burstHearts: () => set((s) => ({ hearts: s.hearts + 1 })),
}));
const store = () => useCloseStore.getState();

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

// ---- Thinking of you -------------------------------------------------------------------
export async function sendHeart() {
  const peer = useChatStore.getState().peer;
  try {
    await api.post('/nudge');
    store().burstHearts();
    toast.show(`❤️ Sent to ${peer?.name ?? 'them'}`);
  } catch (err) {
    if (err.code === 'TOO_FAST') toast.show(err.message);
    else toast.error(err.message);
  }
}

// ---- Together ------------------------------------------------------------------------------
export const loadTogether = () => body(api.get('/together')).then(({ together }) => store().setTogether(together)).catch(() => {});
export const setSince = (since) => run(api.put('/together/since', { since }), ({ together }) => store().setTogether(together));
export const addEvent = (event) => run(api.post('/together/events', event), ({ together }) => store().setTogether(together));
export const updateEvent = (id, changes) => run(api.patch(`/together/events/${id}`, changes), ({ together }) => store().setTogether(together));
export const removeEvent = (id) => run(api.delete(`/together/events/${id}`), ({ together }) => store().setTogether(together));

// ---- Lists -----------------------------------------------------------------------------------
export const loadLists = () => body(api.get('/lists')).then(({ lists }) => store().setLists(lists)).catch(() => {});
export const createList = (name, emoji) => run(api.post('/lists', { name, emoji }), ({ list }) => store().upsertList(list));
export const renameList = (id, changes) => run(api.patch(`/lists/${id}`, changes), ({ list }) => store().upsertList(list));
export const deleteList = (id) => run(api.delete(`/lists/${id}`), () => store().removeList(id));
export const addItem = (id, text) => run(api.post(`/lists/${id}/items`, { text }), ({ list }) => store().upsertList(list));
export const removeItem = (id, itemId) => run(api.delete(`/lists/${id}/items/${itemId}`), ({ list }) => store().upsertList(list));
export const editItem = (id, itemId, text) => run(api.patch(`/lists/${id}/items/${itemId}`, { text }), ({ list }) => store().upsertList(list));

/** Ticks shown at once; reverted if the server refuses. */
export async function toggleItem(list, item) {
  const me = useChatStore.getState().me?.id;
  const done = !item.done;
  store().upsertList({ ...list, items: list.items.map((i) => (i.id === item.id ? { ...i, done, doneBy: done ? me : null } : i)) });
  const ok = await run(api.patch(`/lists/${list.id}/items/${item.id}`, { done }), ({ list: saved }) => store().upsertList(saved));
  if (!ok) store().upsertList(list);
}

export const closeSocketHandlers = {
  nudge: () => {
    store().burstHearts();
    navigator.vibrate?.([70, 50, 70, 50, 140]);
    const peer = useChatStore.getState().peer;
    toast.show(`${peer?.name ?? 'Someone'} is thinking of you ❤️`, { duration: 5000 });
  },
  'together:updated': (together) => store().setTogether(together),
  'together:reminder': ({ title, body: text }) => toast.show(`${title} — ${text}`, { duration: 8000 }),
  'list:updated': (list) => store().upsertList(list),
  'list:removed': ({ id }) => store().removeList(id),
};

// ---- Calendar helpers (local calendar days, "YYYY-MM-DD") --------------------------------------
export const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const utc = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
export const daysBetween = (from, to) => Math.round((utc(to) - utc(from)) / 86400000);

export function nextOccurrence(event, today = todayLocal()) {
  if (!event.yearly) return event.date;
  const [, m, d] = event.date.split('-').map(Number);
  const year = Number(today.slice(0, 4));
  for (const y of [year, year + 1]) {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const day = m === 2 && d === 29 && !leap ? 28 : d;
    const candidate = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (candidate >= today) return candidate;
  }
  return event.date;
}

/** "1 year, 7 months, 28 days" since a calendar day. */
export function durationSince(since, today = todayLocal()) {
  const [sy, sm, sd] = since.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  let years = ty - sy;
  let months = tm - sm;
  let days = td - sd;
  if (days < 0) {
    months -= 1;
    days += new Date(ty, tm - 1, 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return [years && `${years} year${years === 1 ? '' : 's'}`, months && `${months} month${months === 1 ? '' : 's'}`, `${days} day${days === 1 ? '' : 's'}`].filter(Boolean).join(', ');
}
