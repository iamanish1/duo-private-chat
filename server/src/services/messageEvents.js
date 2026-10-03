import { User } from '../models/index.js';
import { logger } from '../utils/logger.js';
import { emitToConversation, isUserViewing } from '../sockets/realtime.js';
import { serializeMessage } from './serializers.js';
import { buildMessageNotification, isPushEnabled, sendToUser } from './pushService.js';

/**
 * Fan-out after a message is persisted: realtime to both people (all their
 * tabs), plus a Web Push to the recipient when they are not looking.
 */
export function publishNewMessage(session, message) {
  const dto = serializeMessage(message);
  emitToConversation(session.conversation._id, 'message:new', dto);
  notifyRecipientIfAway(session, message).catch(() => logger.warn('Message notification failed'));
  return dto;
}

async function notifyRecipientIfAway(session, message) {
  if (!isPushEnabled() || (await isUserViewing(session.peerId))) return;
  const recipient = await User.findById(session.peerId).select('settings').lean();
  const payload = buildMessageNotification({
    sender: session.user,
    message,
    preview: recipient?.settings?.notificationPreview ?? 'sender',
  });
  await sendToUser(session.peerId, payload, { urgency: 'high', topic: 'messages' });
}

export function publishStatus(session, { ids, at }, status) {
  if (!ids.length) return;
  emitToConversation(session.conversation._id, 'message:status', { ids, status, at });
}

export function publishUpdated(session, message) {
  emitToConversation(session.conversation._id, 'message:updated', serializeMessage(message));
}
