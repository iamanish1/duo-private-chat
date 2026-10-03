import { Message } from '../models/index.js';
import { badRequest, forbidden, notFound } from '../utils/AppError.js';
import { escapeRegex, sameId, toObjectId } from '../utils/ids.js';
import { touchConversation } from './conversationService.js';
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
export async function createMessage(session, { type = 'text', text = '', media, clientId, replyTo }) {
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
  if (type === 'media') filter.type = { $in: ['image', 'video'] };
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
  const filter = { conversationId, deletedAt: null, type: type ? type : { $in: ['image', 'video'] } };
  if (before) filter._id = { $lt: toObjectId(before) };
  const docs = await Message.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
  return { messages: docs.slice(0, limit), hasMore: docs.length > limit };
}
