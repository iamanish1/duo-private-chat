import { Conversation } from '../models/index.js';
import { sameId } from '../utils/ids.js';

// There is exactly one conversation in the system; cache it after first read.
let cached = null;

export async function getPrimaryConversation() {
  if (cached) return cached;
  const conversation = await Conversation.findOne({ singleton: 'primary' }).lean();
  if (conversation) cached = conversation;
  return conversation;
}

export function clearConversationCache() {
  cached = null;
}

export const isParticipant = (conversation, userId) =>
  Boolean(conversation?.participants.some((id) => sameId(id, userId)));

export const peerIdOf = (conversation, userId) => conversation.participants.find((id) => !sameId(id, userId));

export async function touchConversation(conversationId, at = new Date()) {
  await Conversation.updateOne({ _id: conversationId }, { $set: { lastMessageAt: at } });
}
