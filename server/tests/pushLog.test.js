import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PushLog, PushSubscription } from '../src/models/index.js';
import { sendToUser, setPushSender } from '../src/services/pushService.js';
import { USERS, loginAs, startTestServer } from './helpers.js';

let ctx;
let sam;
const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };
const ANDROID = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36';

beforeAll(async () => {
  ctx = await startTestServer();
  sam = await loginAs(ctx.app, USERS.sam);
});
afterAll(async () => {
  setPushSender(null);
  await ctx.close();
});

describe('push delivery log', () => {
  it('records sent / skipped / expired per device without any content', async () => {
    await PushSubscription.create([
      { userId: sam.user.id, endpoint: 'https://fcm.googleapis.com/a', keys, userAgent: ANDROID },
      { userId: sam.user.id, endpoint: 'https://fcm.googleapis.com/b', keys, userAgent: WINDOWS },
      { userId: sam.user.id, endpoint: 'https://fcm.googleapis.com/c', keys, userAgent: ANDROID },
    ]);
    setPushSender(async (sub) => {
      if (sub.endpoint.endsWith('/c')) throw Object.assign(new Error('gone'), { statusCode: 410 });
      return { statusCode: 201 };
    });
    await sendToUser(sam.user.id, { type: 'message', title: 'Alex', body: 'secret words' }, { skipEndpoints: ['https://fcm.googleapis.com/b'] });
    await new Promise((r) => setTimeout(r, 100));

    const log = await PushLog.find({ userId: sam.user.id }).lean();
    const summary = log.map((l) => `${l.device}:${l.result}`).sort();
    expect(summary).toEqual(['Android:expired', 'Android:sent', 'Windows:skipped-on-screen']);
    expect(log.every((l) => l.kind === 'message')).toBe(true);
    expect(JSON.stringify(log)).not.toContain('secret');
  });
});
