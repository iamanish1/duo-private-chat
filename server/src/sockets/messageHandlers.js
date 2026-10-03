import * as messages from '../services/messageService.js';
import { publishNewMessage, publishStatus, publishUpdated } from '../services/messageEvents.js';
import { serializeMessage } from '../services/serializers.js';

export function registerMessageHandlers(socket, on) {
  const { session } = socket.data;

  on('message:send', async (data) => {
    const { message, duplicate } = await messages.createMessage(session, { ...data, type: 'text' });
    return { message: duplicate ? serializeMessage(message) : publishNewMessage(session, message) };
  });

  on('message:delivered', async ({ ids }) => {
    publishStatus(session, await messages.markDelivered(session, ids), 'delivered');
  });

  on('message:read', async ({ upTo }) => {
    const result = await messages.markRead(session, upTo);
    publishStatus(session, result, 'read');
    return { count: result.ids.length };
  });

  on('message:react', async ({ id, emoji }) => {
    publishUpdated(session, await messages.setReaction(session, id, emoji));
  });

  on('message:delete', async ({ id }) => {
    publishUpdated(session, await messages.deleteMessage(session, id));
  });
}
