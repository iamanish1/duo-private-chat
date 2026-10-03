import * as messages from '../services/messageService.js';
import { publishNewMessage, publishStatus, publishUpdated } from '../services/messageEvents.js';
import { serializeMessage } from '../services/serializers.js';

const conversationOf = (req) => req.session.conversation._id;

export async function list(req, res) {
  const result = await messages.listMessages(conversationOf(req), req.valid.query);
  res.json({ messages: result.messages.map(serializeMessage), hasMore: result.hasMore });
}

export async function create(req, res) {
  const { message, duplicate } = await messages.createMessage(req.session, { ...req.valid.body, type: 'text' });
  const dto = duplicate ? serializeMessage(message) : publishNewMessage(req.session, message);
  res.status(duplicate ? 200 : 201).json({ message: dto });
}

export async function markRead(req, res) {
  const result = await messages.markRead(req.session, req.valid.params.id);
  publishStatus(req.session, result, 'read');
  res.json(result);
}

export async function remove(req, res) {
  const message = await messages.deleteMessage(req.session, req.valid.params.id);
  publishUpdated(req.session, message);
  res.json({ message: serializeMessage(message) });
}

export async function react(req, res) {
  const message = await messages.setReaction(req.session, req.valid.params.id, req.valid.body.emoji);
  publishUpdated(req.session, message);
  res.json({ message: serializeMessage(message) });
}

export async function search(req, res) {
  const result = await messages.searchMessages(conversationOf(req), req.valid.query);
  res.json({ messages: result.messages.map(serializeMessage), hasMore: result.hasMore });
}

export async function media(req, res) {
  const result = await messages.listMedia(conversationOf(req), req.valid.query);
  res.json({ messages: result.messages.map(serializeMessage), hasMore: result.hasMore });
}
