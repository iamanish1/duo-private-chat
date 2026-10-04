import { Message } from '../models/index.js';
import { badRequest, forbidden, notFound } from '../utils/AppError.js';
import { escapeRegex, sameId, toObjectId } from '../utils/ids.js';
import { touchConversation } from './conversationService.js';
import { findPeerStatus } from './statusService.js';
import { config } from '../config/env.js';
import { emitToConversation } from '../sockets/realtime.js';
import { serializeMessage } from './serializers.js';

const DAY_MS = 24 * 60 * 60 * 1000;
import { removeMedia } from './storage/index.js';

export const DEFAULT_PAGE_SIZE = 40;
const REPLY_FIELDS = 'senderId type text media deletedAt';

const withReply = (query) => query.populate({ path: 'replyTo', select: REPLY_FIELDS });

/** Cursor pagination over the conversation, returned oldest → newest. */
export async function listMessages(conversationId, { before, after, limit = DEFAULT_PAGE_SIZE }) {
  const filter = { conversationId };
  if (before) filter._id = { $lt: toObjectId(before) };
  else if (after) filter._id = { $gt: toObjectId(after) };

  const ascending = Boolean(after) && !before;
  const docs = await withReply(
    Message.find(filter)
      .sort({ _id: ascending ? 1 : -1 })
      .limit(limit + 1),
  ).lean();

  const hasMore = docs.length > limit;
  const page = docs.slice(0, limit);
  return { messages: ascending ? page : page.reverse(), hasMore };
}

export function findByClientId(session, clientId) {
  return withReply(Message.findOne({ senderId: session.user._id, clientId })).lean();
}

async function findInConversation(conversationId, messageId) {
  const message = await Message.findOne({ _id: toObjectId(messageId), conversationId });
  if (!message) throw notFound('Message not found.', 'MESSAGE_NOT_FOUND');
  return message;
}

/**
 * Creates a message from the session user to their peer. Sender, receiver
 * and conversation always come from the server-side session, never input.
 */
export async function createMessage(session, { type = 'text', text = '', media, clientId, replyTo, statusId }) {
  const { user, conversation, peerId } = session;

  if (clientId) {
    const existing = await findByClientId(session, clientId);
    if (existing) return { message: existing, duplicate: true };
  }
  if (type === 'text' && !text.trim()) throw badRequest('Message cannot be empty.', 'EMPTY_MESSAGE');
  if (type !== 'text' && !media) throw badRequest('Media is missing.', 'MEDIA_REQUIRED');

  if (replyTo) {
    const exists = await Message.exists({ _id: toObjectId(replyTo), conversationId: conversation._id });
    if (!exists) throw badRequest('The message you replied to no longer exists.', 'INVALID_REPLY');
  }

  let statusReply;
  if (statusId) {
    const status = await findPeerStatus(session, statusId);
    statusReply = {
      statusId: status._id,
      type: status.type,
      text: status.text.slice(0, 160),
      background: status.background,
      media: status.media,
      expiresAt: status.expiresAt,
    };
  }

  let doc;
  try {
    doc = await Message.create({
      conversationId: conversation._id,
      senderId: user._id,
      receiverId: peerId,
      clientId,
      type,
      text: text.trim(),
      media,
      replyTo: replyTo ? toObjectId(replyTo) : null,
      statusReply,
    });
  } catch (err) {
    // Concurrent retry with the same clientId: return the winner.
    if (err.code === 11000 && clientId) {
      const existing = await findByClientId(session, clientId);
      if (existing) return { message: existing, duplicate: true };
    }
    throw err;
  }

  await touchConversation(conversation._id, doc.createdAt);
  const message = await withReply(Message.findById(doc._id)).lean();
  return { message, duplicate: false };
}

/** Marks messages addressed to `userId` as delivered; returns affected ids. */
export async function markDelivered(session, ids) {
  const filter = { conversationId: session.conversation._id, receiverId: session.user._id, status: 'sent' };
  if (ids) filter._id = { $in: ids.map(toObjectId) };
  const pending = await Message.find(filter).select('_id').lean();
  if (!pending.length) return { ids: [], at: null };
  const at = new Date();
  const pendingIds = pending.map((m) => m._id);
  await Message.updateMany({ _id: { $in: pendingIds }, status: 'sent' }, { $set: { status: 'delivered', deliveredAt: at } });
  return { ids: pendingIds.map(String), at };
}

/** Marks every incoming message up to and including `upToId` as read. */
export async function markRead(session, upToId) {
  const target = await findInConversation(session.conversation._id, upToId);
  const filter = {
    conversationId: session.conversation._id,
    receiverId: session.user._id,
    status: { $in: ['sent', 'delivered'] },
    _id: { $lte: target._id },
  };
  const unread = await Message.find(filter).select('_id deliveredAt').lean();
  if (!unread.length) return { ids: [], at: null };
  const at = new Date();
  const unreadIds = unread.map((m) => m._id);
  const undelivered = unread.filter((m) => !m.deliveredAt).map((m) => m._id);
  await Message.updateMany({ _id: { $in: unreadIds } }, { $set: { status: 'read', readAt: at } });
  if (undelivered.length) await Message.updateMany({ _id: { $in: undelivered } }, { $set: { deliveredAt: at } });
  return { ids: unreadIds.map(String), at };
}

export async function deleteMessage(session, messageId) {
  const message = await findInConversation(session.conversation._id, messageId);
  if (!sameId(message.senderId, session.user._id)) throw forbidden('You can only delete your own messages.', 'NOT_SENDER');
  if (message.deletedAt) return withReply(Message.findById(message._id)).lean();

  const media = message.media?.toObject?.() ?? message.media;
  message.deletedAt = new Date();
  message.text = '';
  message.media = undefined;
  message.reactions = [];
  await message.save();
  removeMedia(media);
  return withReply(Message.findById(message._id)).lean();
}

/** One reaction per person per message; `emoji: null` removes it. */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;
const CAPTION_MAX = 1000;

/**
 * The sender corrects a text message or a photo/video caption, within
 * EDIT_WINDOW_MS of sending. Voice notes have no text to edit.
 */
export async function editMessage(session, messageId, rawText) {
  const message = await findInConversation(session.conversation._id, messageId);
  if (!sameId(message.senderId, session.user._id)) throw forbidden('You can only edit your own messages.', 'NOT_SENDER');
  if (message.deletedAt) throw badRequest('This message was deleted.', 'MESSAGE_DELETED');
  if (message.type === 'audio') throw badRequest('Voice notes can’t be edited.', 'NOT_EDITABLE');
  if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) {
    throw forbidden('Messages can only be edited for 15 minutes after sending.', 'EDIT_WINDOW_PASSED');
  }
  const text = rawText.trim();
  if (message.type === 'text' && !text) throw badRequest('Message cannot be empty.', 'EMPTY_MESSAGE');
  if (message.type !== 'text' && text.length > CAPTION_MAX) {
    throw badRequest('Captions can be up to 1000 characters.', 'VALIDATION_ERROR');
  }
  if (text !== message.text) {
    message.text = text;
    message.editedAt = new Date();
    await message.save();
  }
  return withReply(Message.findById(message._id)).lean();
}

export async function setReaction(session, messageId, emoji) {
  const message = await findInConversation(session.conversation._id, messageId);
  if (message.deletedAt) throw badRequest('You cannot react to a deleted message.', 'MESSAGE_DELETED');
  const others = message.reactions.filter((r) => !sameId(r.userId, session.user._id));
  message.reactions = emoji ? [...others, { userId: session.user._id, emoji }] : others;
  await message.save();
  return withReply(Message.findById(message._id)).lean();
}

export async function searchMessages(conversationId, { q, type, from, to, before, limit = 30 }) {
  const filter = { conversationId, deletedAt: null };
  if (q) filter.text = { $regex: escapeRegex(q), $options: 'i' };
  if (type === 'media') {
    filter.type = { $in: ['image', 'video'] };
    filter.mediaExpiredAt = null;
  }
  else if (type) filter.type = type;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }
  if (before) filter._id = { $lt: toObjectId(before) };

  const docs = await withReply(Message.find(filter).sort({ _id: -1 }).limit(limit + 1)).lean();
  return { messages: docs.slice(0, limit), hasMore: docs.length > limit };
}

export async function listMedia(conversationId, { type, before, limit = 60 }) {
  const filter = { conversationId, deletedAt: null, mediaExpiredAt: null, type: type ? type : { $in: ['image', 'video'] } };
  if (before) filter._id = { $lt: toObjectId(before) };
  const docs = await Message.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
  return { messages: docs.slice(0, limit), hasMore: docs.length > limit };
}

// ---- Old-video clean-up ---------------------------------------------------------
const retentionCutoff = (days) => new Date(Date.now() - days * DAY_MS);

/** "Keep forever" on/off for a video, so the clean-up never removes it. Either person can. */
export async function setKeep(session, messageId, keep) {
  const message = await findInConversation(session.conversation._id, messageId);
  if (message.deletedAt) throw badRequest('This message was deleted.', 'MESSAGE_DELETED');
  if (!config.media.retentionTypes.includes(message.type)) throw badRequest('Only videos are removed automatically, so this one is already kept.', 'NOT_REMOVABLE');
  if (message.mediaExpiredAt || !message.media) throw badRequest('This video was already removed.', 'MEDIA_EXPIRED');
  message.keptAt = keep ? message.keptAt ?? new Date() : null;
  await message.save();
  return withReply(Message.findById(message._id)).lean();
}

/** Videos that will be removed within the reminder window, oldest first. */
export async function listExpiring(conversationId) {
  const { retentionDays, retentionReminderDays, retentionTypes } = config.media;
  if (!retentionDays) return [];
  return Message.find({
    conversationId,
    type: { $in: retentionTypes },
    deletedAt: null,
    keptAt: null,
    mediaExpiredAt: null,
    'media.key': { $exists: true },
    createdAt: { $lte: retentionCutoff(retentionDays - retentionReminderDays) },
  })
    .sort({ createdAt: 1 })
    .limit(100)
    .lean();
}

/**
 * Removes the files of videos older than the retention period (unless kept).
 * The message stays, marked "removed after 2 years", for both people live.
 */
export async function expireOldMedia({ limit = 300 } = {}) {
  const { retentionDays, retentionTypes } = config.media;
  if (!retentionDays) return { mediaExpired: 0, mediaBytesFreed: 0 };
  const old = await Message.find({
    type: { $in: retentionTypes },
    deletedAt: null,
    keptAt: null,
    mediaExpiredAt: null,
    'media.key': { $exists: true },
    createdAt: { $lt: retentionCutoff(retentionDays) },
  })
    .limit(limit)
    .lean();
  let bytes = 0;
  for (const message of old) {
    await removeMedia(message.media);
    bytes += message.media.size || 0;
    await Message.updateOne({ _id: message._id }, { $set: { mediaExpiredAt: new Date() }, $unset: { media: 1 } });
    const updated = await withReply(Message.findById(message._id)).lean();
    emitToConversation(message.conversationId, 'message:updated', serializeMessage(updated));
  }
  return { mediaExpired: old.length, mediaBytesFreed: bytes };
}
