// Pinned messages: any number, shared by both people, each with an optional title.
import { create } from 'zustand';
import { chatApi } from './api';
import { useChatStore } from '../store/chatStore';
import { toast } from '../store/toastStore';

export const usePinStore = create(() => ({ pinned: [] }));

const setPinned = (pinned) => usePinStore.setState({ pinned });
const newestFirst = (list) => [...list].sort((a, b) => new Date(b.pin.at) - new Date(a.pin.at));

export async function loadPins() {
  try {
    const { messages } = await chatApi.pinned();
    setPinned(messages);
  } catch {
    // The next reconnect will try again.
  }
}

/** Keeps the pinned list in step with any updated message (pinned, renamed, unpinned, deleted). */
export function syncPin(message) {
  if (!message?.id) return;
  const { pinned } = usePinStore.getState();
  const before = pinned.find((m) => m.id === message.id);
  const others = pinned.filter((m) => m.id !== message.id);
  if (message.pin && !message.deleted) setPinned(newestFirst([...others, message]));
  else if (before) setPinned(others);

  const { me, peer } = useChatStore.getState();
  if (message.pin && !before && message.pin.by !== me?.id) toast.show(`📌 ${peer?.name ?? 'Your partner'} pinned a message`);
}

export async function pinMessage(message, title = '') {
  try {
    const { message: updated } = await chatApi.pin(message.id, title.trim());
    useChatStore.getState().upsert(updated);
    syncPin(updated);
    toast.show(message.pin ? 'Pin updated' : '📌 Pinned');
    return true;
  } catch (err) {
    toast.error(err.message);
    return false;
  }
}

export async function unpinMessage(message) {
  try {
    const { message: updated } = await chatApi.unpin(message.id);
    useChatStore.getState().upsert(updated);
    syncPin(updated);
    toast.show('Unpinned');
  } catch (err) {
    toast.error(err.message);
  }
}
