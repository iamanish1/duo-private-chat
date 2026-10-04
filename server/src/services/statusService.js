import { Message, Status } from '../models/index.js';
import { badRequest, forbidden, notFound } from '../utils/AppError.js';
import { sameId, toObjectId } from '../utils/ids.js';
import { logger } from '../utils/logger.js';
import { removeMedia } from './storage/index.js';

export const STATUS_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const STATUS_VIDEO_MAX_SECONDS = 60;
const MAX_ACTIVE_STATUSES = 30;

const active = (conversationId) => ({ conversationId, expiresAt: { $gt: new Date() } });

/** Both people's statuses from the last 24 hours, oldest first. */
export function listStatuses(session) {
  return Status.find(active(session.conversation._id)).sort({ createdAt: 1 }).lean();
}

/** A status of the *other* person that can still be seen (and replied to). */
export async function findPeerStatus(session, statusId) {
  const status = await Status.findOne({ ...active(session.conversation._id), _id: toObjectId(statusId), userId: session.peerId }).lean();
  if (!status) throw badRequest('This status is no longer available.', 'STATUS_NOT_FOUND');
  return status;
}

export async function createStatus(session, { type, text = '', background = 0, media }) {
  const trimmed = text.trim();
  if (type === 'text' && !trimmed) throw badRequest('Write something for your status.', 'EMPTY_STATUS');
  const count = await Status.countDocuments({ ...active(session.conversation._id), userId: session.user._id });
  if (count >= MAX_ACTIVE_STATUSES) {
    throw badRequest(`You can have up to ${MAX_ACTIVE_STATUSES} statuses at a time. Delete one first.`, 'TOO_MANY_STATUSES');
  }
  const doc = await Status.create({
    conversationId: session.conversation._id,
    userId: session.user._id,
    type,
    text: trimmed,
    background: type === 'text' ? background : 0,
    media,
    expiresAt: new Date(Date.now() + STATUS_LIFETIME_MS),
  });
  return doc.toObject();
}

/**
 * The other person opened a status: records the first time only.
 * Returns { status, changed } — `changed` is false for repeat views and for
 * the owner looking at their own status.
 */
export async function markStatusViewed(session, statusId) {
  const status = await Status.findOne({ ...active(session.conversation._id), _id: toObjectId(statusId) }).lean();
  if (!status) throw notFound('This status is no longer available.', 'STATUS_NOT_FOUND');
  if (sameId(status.userId, session.user._id) || status.viewedAt) return { status, changed: false };
  const updated = await Status.findOneAndUpdate(
    { _id: status._id, viewedAt: null },
    { $set: { viewedAt: new Date() } },
    { returnDocument: 'after' },
  ).lean();
  return updated ? { status: updated, changed: true } : { status: await Status.findById(status._id).lean(), changed: false };
}

export async function deleteStatus(session, statusId) {
  const status = await Status.findOne({ _id: toObjectId(statusId), conversationId: session.conversation._id }).lean();
  if (!status) throw notFound('This status is no longer available.', 'STATUS_NOT_FOUND');
  if (!sameId(status.userId, session.user._id)) throw forbidden('You can only delete your own status.', 'NOT_OWNER');
  await Status.deleteOne({ _id: status._id });
  // Replies keep their text quote but stop pointing at the deleted file.
  await Message.updateMany({ 'statusReply.statusId': status._id }, { $set: { 'statusReply.expiresAt': new Date() } });
  removeMedia(status.media);
  return status;
}

/** Deletes expired statuses together with their stored photos/videos. */
export async function sweepExpiredStatuses() {
  const expired = await Status.find({ expiresAt: { $lte: new Date() } }).select('media').lean();
  if (!expired.length) return 0;
  await Promise.all(expired.map((s) => removeMedia(s.media)));
  await Status.deleteMany({ _id: { $in: expired.map((s) => s._id) } });
  logger.info(`Removed ${expired.length} expired status${expired.length === 1 ? '' : 'es'}`);
  return expired.length;
}
