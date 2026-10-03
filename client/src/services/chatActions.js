// Chat operations shared by components and realtime handlers. They work on
// the Zustand store directly so they can be called from anywhere.
import { chatApi } from './api';
import { emit, emitWithAck, getSocket } from './socket';
import { useChatStore } from '../store/chatStore';
import { toast } from '../store/toastStore';
import { createClientId } from '../utils/id';
import { isPending, latestUnreadIncoming, newestConfirmedId } from '../utils/messageList';

const PAGE_SIZE = 40;
const store = () => useChatStore.getState();
const inflight = new Set();
const pendingMedia = new Map(); // clientId -> { prepared, caption, replyToId }
const uploadControllers = new Map();
const view = { atBottom: true };
let lastReadSent = null;

const replySummary = (m) =>
  m && { id: m.id, senderId: m.senderId, type: m.type, text: (m.text || '').slice(0, 160), thumbnailUrl: m.media?.thumbnailUrl ?? m.localPreview?.thumbnailUrl ?? null };

function optimistic(fields) {
  const { me, peer, replyTo } = store();
  return {
    id: null,
    clientId: createClientId(),
    senderId: me.id,
    receiverId: peer.id,
    status: 'sending',
    createdAt: new Date().toISOString(),
    reactions: [],
    text: '',
    replyTo: replySummary(replyTo),
    replyToId: replyTo?.id ?? null,
    ...fields,
  };
}

// ---- Loading ---------------------------------------------------------------
export async function loadConversation() {
  store().setStatus('loading');
  try {
    const [conversation, page] = await Promise.all([chatApi.conversation(), chatApi.messages({ limit: PAGE_SIZE })]);
    store().setBootstrap(conversation);
    store().setMessages(page.messages, page.hasMore);
    store().setStatus('ready');
  } catch (err) {
    if (err.status !== 401) store().setStatus('error', err.message);
  }
}

export async function loadOlder() {
  const s = store();
  if (s.loadingOlder || !s.hasMore) return;
  const oldest = s.messages.find((m) => !isPending(m));
  if (!oldest) return;
  s.setLoadingOlder(true);
  try {
    const page = await chatApi.messages({ before: oldest.id, limit: PAGE_SIZE });
    store().prependOlder(page.messages, page.hasMore);
  } catch (err) {
    store().setLoadingOlder(false);
    toast.error(err.message);
  }
}

/** Loads older pages until a message is present (for jumping from search). */
export async function ensureMessageLoaded(messageId, maxPages = 25) {
  for (let i = 0; i < maxPages; i += 1) {
    if (store().messages.some((m) => m.id === messageId)) return true;
    if (!store().hasMore) return false;
    await loadOlder();
  }
  return store().messages.some((m) => m.id === messageId);
}

/** After a reconnect, fetch whatever arrived while we were away. */
export async function syncNewer() {
  if (store().status !== 'ready') return;
  let after = newestConfirmedId(store().messages);
  if (!after) return;
  try {
    for (let i = 0; i < 10; i += 1) {
      const page = await chatApi.messages({ after, limit: 50 });
      store().merge(page.messages);
      if (!page.hasMore || !page.messages.length) break;
      after = page.messages.at(-1).id;
    }
    acknowledgeDelivered(store().messages);
    markSeen();
  } catch {
    // The next reconnect will try again.
  }
}

// ---- Sending text ------------------------------------------------------------
export function sendText(text) {
  const message = optimistic({ type: 'text', text: text.trim() });
  store().upsert(message);
  store().setReplyTo(null);
  deliverText(message);
}

async function deliverText(message) {
  if (inflight.has(message.clientId) || !getSocket().connected) return; // flushed on reconnect
  inflight.add(message.clientId);
  try {
    const { message: saved } = await emitWithAck('message:send', {
      text: message.text,
      clientId: message.clientId,
      ...(message.replyToId && { replyTo: message.replyToId }),
    });
    store().upsert(saved);
  } catch (err) {
    // Disconnects/timeouts stay "sending" and retry; clientId makes it idempotent.
    if (err.code !== 'DISCONNECTED' && err.code !== 'TIMEOUT') {
      store().patchByClientId(message.clientId, { status: 'failed', error: err.message });
    }
  } finally {
    inflight.delete(message.clientId);
  }
}

export function flushOutbox() {
  store()
    .messages.filter((m) => m.status === 'sending' && m.type === 'text' && !m.id)
    .forEach(deliverText);
}

// ---- Sending media -----------------------------------------------------------
const VOICE_EXTENSIONS = { 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/webm': 'webm' };

/** Sends a recorded voice note: { blob, duration, waveform, mimeType }. */
export function sendVoice({ blob, duration, waveform, mimeType }) {
  const file = new File([blob], `voice.${VOICE_EXTENSIONS[mimeType] ?? 'webm'}`, { type: mimeType });
  const url = URL.createObjectURL(file);
  const message = optimistic({
    type: 'audio',
    localPreview: { url, thumbnailUrl: null },
    media: { url, thumbnailUrl: null, duration, waveform, mimeType, size: file.size },
  });
  pendingMedia.set(message.clientId, { prepared: { kind: 'voice', file, duration, waveform }, caption: '', replyToId: message.replyToId });
  store().upsert(message);
  store().setReplyTo(null);
  upload(message.clientId);
}

export function sendMedia(prepared, caption = '') {
  const fileUrl = URL.createObjectURL(prepared.file);
  const posterUrl = prepared.thumbnail ? URL.createObjectURL(prepared.thumbnail) : null;
  const localPreview = { url: fileUrl, thumbnailUrl: prepared.kind === 'image' ? fileUrl : posterUrl };
  const message = optimistic({
    type: prepared.kind,
    text: caption.trim(),
    localPreview,
    media: { url: fileUrl, thumbnailUrl: localPreview.thumbnailUrl, width: prepared.width, height: prepared.height, duration: prepared.duration, mimeType: prepared.file.type, size: prepared.file.size },
  });
  pendingMedia.set(message.clientId, { prepared, caption: message.text, replyToId: message.replyToId });
  store().upsert(message);
  store().setReplyTo(null);
  upload(message.clientId);
}

async function upload(clientId) {
  const job = pendingMedia.get(clientId);
  if (!job) return;
  const { prepared, caption, replyToId } = job;
  const controller = new AbortController();
  uploadControllers.set(clientId, controller);
  store().setUpload(clientId, { progress: 0, error: null });

  const form = new FormData();
  form.append('clientId', clientId);
  if (caption) form.append('text', caption);
  if (replyToId) form.append('replyTo', replyToId);
  for (const key of ['width', 'height', 'duration']) if (prepared[key]) form.append(key, String(Math.round(prepared[key] * 100) / 100));
  if (prepared.kind === 'voice') {
    form.append('kind', 'voice');
    form.append('waveform', JSON.stringify(prepared.waveform));
  }
  form.append('file', prepared.file, prepared.file.name || `${prepared.kind}`);
  if (prepared.thumbnail) form.append('thumbnail', prepared.thumbnail, 'thumbnail.jpg');

  try {
    const { message } = await chatApi.upload(form, {
      signal: controller.signal,
      onProgress: (progress) => store().setUpload(clientId, { progress }),
    });
    store().upsert(message);
    store().clearUpload(clientId);
    pendingMedia.delete(clientId);
  } catch (err) {
    if (err.cancelled) return;
    store().patchByClientId(clientId, { status: 'failed', error: err.message });
    store().setUpload(clientId, { error: err.message });
  } finally {
    uploadControllers.delete(clientId);
  }
}

export function cancelUpload(clientId) {
  uploadControllers.get(clientId)?.abort();
  discardPending(clientId);
}

export function retryMessage(message) {
  store().patchByClientId(message.clientId, { status: 'sending', error: null });
  if (message.type === 'text') deliverText({ ...message, status: 'sending' });
  else upload(message.clientId);
}

export function discardPending(clientId) {
  const message = store().messages.find((m) => m.clientId === clientId);
  if (message?.localPreview) {
    URL.revokeObjectURL(message.localPreview.url);
    if (message.localPreview.thumbnailUrl !== message.localPreview.url) URL.revokeObjectURL(message.localPreview.thumbnailUrl);
  }
  pendingMedia.delete(clientId);
  store().clearUpload(clientId);
  store().removeByClientId(clientId);
}

// ---- Message actions ----------------------------------------------------------
export async function deleteMessage(message) {
  try {
    const { message: updated } = await chatApi.remove(message.id);
    store().upsert(updated);
  } catch (err) {
    toast.error(err.message);
  }
}

export async function reactToMessage(message, emoji) {
  const { me } = store();
  const mine = message.reactions.find((r) => r.userId === me.id);
  const next = mine?.emoji === emoji ? null : emoji;
  const others = message.reactions.filter((r) => r.userId !== me.id);
  store().upsert({ ...message, reactions: next ? [...others, { userId: me.id, emoji: next }] : others });
  try {
    const { message: updated } = await chatApi.react(message.id, next);
    store().upsert(updated);
  } catch (err) {
    store().upsert(message);
    toast.error(err.message);
  }
}

// ---- Receipts -----------------------------------------------------------------
export function acknowledgeDelivered(messages) {
  const { me } = store();
  const ids = messages.filter((m) => m.senderId !== me?.id && m.status === 'sent' && m.id).map((m) => m.id);
  if (ids.length) emit('message:delivered', { ids: ids.slice(-200) });
}

export function setViewportAtBottom(atBottom) {
  view.atBottom = atBottom;
  if (atBottom) markSeen();
}

/** Sends a read receipt when the newest incoming message is actually on screen. */
export function markSeen() {
  const { messages, me, status } = store();
  if (status !== 'ready' || !me || document.visibilityState !== 'visible' || !view.atBottom) return;
  const target = latestUnreadIncoming(messages, me.id);
  if (!target || target.id === lastReadSent) return;
  lastReadSent = target.id;
  const now = new Date().toISOString();
  const ids = messages.filter((m) => m.senderId !== me.id && m.id && m.id <= target.id && m.status !== 'read').map((m) => m.id);
  store().applyStatus({ ids, status: 'read', at: now });
  if (getSocket().connected) emit('message:read', { upTo: target.id });
  else chatApi.markRead(target.id).catch(() => {
    lastReadSent = null;
  });
}
