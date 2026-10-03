import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PushSubscription } from '../src/models/index.js';
import { buildCallNotification, buildMessageNotification } from '../src/services/pushService.js';
import { USERS, loginAs, startTestServer } from './helpers.js';

let ctx;
let alex;
beforeAll(async () => {
  ctx = await startTestServer();
  alex = await loginAs(ctx.app, USERS.alex);
});
afterAll(() => ctx.close());

const subscription = {
  endpoint: 'https://push.example.com/send/abc123',
  expirationTime: null,
  keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' },
};

describe('notification APIs', () => {
  it('reports whether push is configured', async () => {
    const res = await alex.get('/api/notifications/public-key');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: false, publicKey: null });
  });

  it('refuses to store subscriptions when push is disabled, and validates them', async () => {
    expect((await alex.post('/api/notifications/subscribe').send(subscription)).status).toBe(503);
    const insecure = await alex.post('/api/notifications/subscribe').send({ ...subscription, endpoint: 'http://push.example.com/x' });
    expect(insecure.status).toBe(400);
    expect(await PushSubscription.countDocuments()).toBe(0);
  });

  it('unsubscribe only removes the caller’s own subscriptions', async () => {
    await PushSubscription.create({ userId: alex.user.id, endpoint: subscription.endpoint, keys: subscription.keys });
    const sam = await loginAs(ctx.app, USERS.sam);
    await sam.delete('/api/notifications/subscribe').send({ endpoint: subscription.endpoint });
    expect(await PushSubscription.countDocuments()).toBe(1);
    await alex.delete('/api/notifications/subscribe').send({ endpoint: subscription.endpoint });
    expect(await PushSubscription.countDocuments()).toBe(0);
  });

  it('saves the notification privacy preference', async () => {
    const res = await alex.patch('/api/users/me').send({ settings: { notificationPreview: 'hidden' } });
    expect(res.body.user.settings.notificationPreview).toBe('hidden');
    expect((await alex.patch('/api/users/me').send({ settings: { notificationPreview: 'everything' } })).status).toBe(400);
  });
});

describe('notification payload privacy', () => {
  const sender = { name: 'Alex' };
  const message = { type: 'text', text: 'our secret plans' };

  it('never includes message text unless the recipient opted in', () => {
    expect(JSON.stringify(buildMessageNotification({ sender, message, preview: 'sender' }))).not.toContain('secret');
    const hidden = buildMessageNotification({ sender, message, preview: 'hidden' });
    expect(JSON.stringify(hidden)).not.toContain('secret');
    expect(JSON.stringify(hidden)).not.toContain('Alex');
    expect(buildMessageNotification({ sender, message, preview: 'full' }).body).toBe('our secret plans');
  });

  it('labels voice call notifications', () => {
    expect(buildCallNotification({ caller: sender, callId: '1', type: 'audio' }).body).toBe('Incoming voice call');
    expect(buildCallNotification({ caller: sender, callId: '1' }).body).toBe('Incoming video call');
  });

  it('hides the caller name in hidden mode', () => {
    expect(buildCallNotification({ caller: sender, preview: 'hidden', callId: '1' }).title).toBe('Incoming call');
  });
});
