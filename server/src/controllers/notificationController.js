import { config } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { isPushEnabled, removeSubscription, saveSubscription, sendToUser } from '../services/pushService.js';

const requirePush = () => {
  if (!isPushEnabled()) throw new AppError(503, 'PUSH_DISABLED', 'Push notifications are not configured on this server.');
};

export function getPublicKey(req, res) {
  res.json({ enabled: isPushEnabled(), publicKey: isPushEnabled() ? config.push.publicKey : null });
}

export async function subscribe(req, res) {
  requirePush();
  await saveSubscription(req.session.user._id, req.valid.body, req.get('user-agent'));
  res.status(201).json({ subscribed: true });
}

export async function unsubscribe(req, res) {
  await removeSubscription(req.session.user._id, req.valid.body.endpoint);
  res.status(204).end();
}

/** Sends a test notification to the caller's own devices. */
export async function sendTest(req, res) {
  requirePush();
  const { sent } = await sendToUser(req.session.user._id, {
    type: 'test',
    tag: 'duo-test',
    url: '/',
    title: 'Notifications are on',
    body: 'This is how new messages will reach you.',
  });
  res.json({ sent });
}
