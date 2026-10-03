import webpush from 'web-push';
import { config } from '../config/env.js';
import { PushSubscription } from '../models/index.js';
import { logger } from '../utils/logger.js';

if (config.push.enabled) {
  webpush.setVapidDetails(config.push.subject, config.push.publicKey, config.push.privateKey);
}

// Tests inject a fake sender instead of contacting real push services.
let sendOverride = null;
export function setPushSender(fn) {
  sendOverride = fn;
}

export const isPushEnabled = () => config.push.enabled || Boolean(sendOverride);

export async function saveSubscription(userId, subscription, userAgent) {
  // The same browser may switch accounts; the endpoint follows the latest owner.
  await PushSubscription.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    { $set: { userId, keys: subscription.keys, userAgent: userAgent?.slice(0, 300) } },
    { upsert: true },
  );
}

export async function removeSubscription(userId, endpoint) {
  const result = await PushSubscription.deleteOne({ userId, endpoint });
  return result.deletedCount > 0;
}

/**
 * Sends an encrypted push to every subscribed device of a user. Expired
 * subscriptions (404/410) are pruned. Never throws: push is best-effort.
 */
export async function sendToUser(userId, payload, { ttl = 60 * 60, urgency = 'normal', topic, skipEndpoints = [] } = {}) {
  if (!isPushEnabled()) return { sent: 0 };
  const skip = new Set(skipEndpoints);
  const subscriptions = (await PushSubscription.find({ userId }).lean()).filter((sub) => !skip.has(sub.endpoint));
  const body = JSON.stringify(payload);
  let sent = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await (sendOverride ?? webpush.sendNotification)({ endpoint: sub.endpoint, keys: sub.keys }, body, { TTL: ttl, urgency, topic });
        sent += 1;
        await PushSubscription.updateOne({ _id: sub._id }, { $set: { lastUsedAt: new Date() } });
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
        } else {
          logger.warn('Push delivery failed', { status: err.statusCode });
        }
      }
    }),
  );
  return { sent };
}

const MEDIA_LABEL = { image: '📷 Photo', video: '🎥 Video', audio: '🎤 Voice message' };

/** Builds a notification that reveals only what the recipient opted into. */
export function buildMessageNotification({ sender, message, preview }) {
  const base = { type: 'message', tag: 'duo-messages', url: '/' };
  if (preview === 'hidden') return { ...base, title: 'New message', body: 'Open to view' };
  if (preview === 'full') {
    const body = message.text ? message.text.slice(0, 140) : MEDIA_LABEL[message.type] || 'New message';
    return { ...base, title: sender.name, body };
  }
  const what = { text: 'a message', image: 'a photo', video: 'a video', audio: 'a voice message' }[message.type] ?? 'a message';
  return { ...base, title: sender.name, body: `Sent you ${what}` };
}

export function buildCallNotification({ caller, preview, callId }) {
  return {
    type: 'call',
    tag: `duo-call-${callId}`,
    url: '/',
    title: preview === 'hidden' ? 'Incoming call' : caller.name,
    body: 'Incoming video call',
    requireInteraction: true,
  };
}
