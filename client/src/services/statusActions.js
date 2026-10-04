// Status (24-hour updates) operations, shared by pages and realtime handlers.
import { statusApi } from './api';
import { isLive, useStatusStore } from '../store/statusStore';
import { toast } from '../store/toastStore';
import { STATUS } from '../config';

const store = () => useStatusStore.getState();
const viewedSent = new Set();

export async function loadStatuses() {
  try {
    const { statuses } = await statusApi.list();
    store().setAll(statuses);
  } catch {
    // Shown as "no updates"; the next reconnect tries again.
  }
}

export async function postTextStatus(text, background) {
  try {
    const { status } = await statusApi.postText(text.trim(), background);
    store().upsert(status);
    return true;
  } catch (err) {
    toast.error(err.message);
    return false;
  }
}

/** Uploads a prepared photo/video (see utils/media prepareMedia). */
export async function postMediaStatus(prepared, caption = '') {
  if (prepared.kind === 'video' && prepared.duration > STATUS.videoSeconds + 1) {
    toast.error(`Status videos can be up to ${STATUS.videoSeconds} seconds long.`);
    return;
  }
  const form = new FormData();
  if (caption.trim()) form.append('text', caption.trim());
  for (const key of ['width', 'height', 'duration']) if (prepared[key]) form.append(key, String(Math.round(prepared[key] * 100) / 100));
  form.append('file', prepared.file, prepared.file.name || prepared.kind);
  if (prepared.thumbnail) form.append('thumbnail', prepared.thumbnail, 'thumbnail.jpg');

  store().setUploading({ progress: 0, kind: prepared.kind });
  try {
    const { status } = await statusApi.upload(form, { onProgress: (progress) => store().setUploading({ progress, kind: prepared.kind }) });
    store().upsert(status);
    toast.show('Status posted');
  } catch (err) {
    toast.error(err.message);
  } finally {
    store().setUploading(null);
  }
}

/** Records that I opened the other person's status (once per status). */
export async function markStatusViewed(status, myId) {
  if (status.userId === myId || status.viewedAt || viewedSent.has(status.id)) return;
  viewedSent.add(status.id);
  store().setViewed(status.id, new Date().toISOString());
  try {
    const { status: updated } = await statusApi.view(status.id);
    store().upsert(updated);
  } catch {
    viewedSent.delete(status.id);
  }
}

export async function deleteStatus(status) {
  try {
    await statusApi.remove(status.id);
    store().remove(status.id);
    toast.show('Status deleted');
  } catch (err) {
    toast.error(err.message);
  }
}

/** Opens a status quoted in a chat reply, if it's still around. */
export function openQuotedStatus(statusReply) {
  const status = store().statuses.find((s) => s.id === statusReply.statusId);
  if (!status || !isLive(status)) {
    toast.show('This status is no longer available.');
    return;
  }
  store().openViewer(status.userId, status.id);
}

export const statusSocketHandlers = {
  'status:new': (status) => store().upsert(status),
  'status:viewed': ({ id, viewedAt }) => store().setViewed(id, viewedAt),
  'status:deleted': ({ id }) => store().remove(id),
};
