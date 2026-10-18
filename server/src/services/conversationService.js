import { Conversation } from '../models/index.js';
import { sameId } from '../utils/ids.js';

// Each person belongs to exactly one private conversation; cache it per person.
const cached = new Map(); // userId -> conversation

export async function getConversationOf(userId) {
  const key = String(userId);
  if (cached.has(key)) return cached.get(key);
  const conversation = await Conversation.findOne({ participants: userId }).lean();
  if (conversation) cached.set(key, conversation);
  return conversation;
}

export function clearConversationCache() {
  cached.clear();
}

export const isParticipant = (conversation, userId) =>
  Boolean(conversation?.participants.some((id) => sameId(id, userId)));

export const peerIdOf = (conversation, userId) => conversation.participants.find((id) => !sameId(id, userId));

export async function touchConversation(conversationId, at = new Date()) {
  await Conversation.updateOne({ _id: conversationId }, { $set: { lastMessageAt: at } });
}
