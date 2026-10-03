import { User } from '../models/index.js';
import { logger } from '../utils/logger.js';
import { emitToConversation, onScreenPushEndpoints } from '../sockets/realtime.js';
import { serializeMessage } from './serializers.js';
import { buildMessageNotification, isPushEnabled, sendToUser } from './pushService.js';

/**
 * Fan-out after a message is persisted: realtime to both people (all their
 * tabs), plus a Web Push to each of the recipient's devices that isn't
 * showing the app right now.
 */
export function publishNewMessage(session, message) {
  const dto = serializeMessage(message);
  emitToConversation(session.conversation._id, 'message:new', dto);
  notifyRecipientDevices(session, message).catch(() => logger.warn('Message notification failed'));
  return dto;
}

async function notifyRecipientDevices(session, message) {
  if (!isPushEnabled()) return;
  // Per device: only the devices showing the chat right now are skipped.
  const skipEndpoints = await onScreenPushEndpoints(session.peerId);
  const recipient = await User.findById(session.peerId).select('settings').lean();
  const payload = buildMessageNotification({
    sender: session.user,
    message,
    preview: recipient?.settings?.notificationPreview ?? 'sender',
  });
  await sendToUser(session.peerId, payload, { urgency: 'high', topic: 'messages', skipEndpoints });
}

export function publishStatus(session, { ids, at }, status) {
  if (!ids.length) return;
  emitToConversation(session.conversation._id, 'message:status', { ids, status, at });
}

export function publishUpdated(session, message) {
  emitToConversation(session.conversation._id, 'message:updated', serializeMessage(message));
}
