import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PushSubscription } from '../src/models/index.js';
import { setPushSender } from '../src/services/pushService.js';
import { USERS, clientId, connectSocket, delay, emitAck, loginAs, startTestServer } from './helpers.js';

const PHONE = 'https://fcm.googleapis.com/fcm/send/phone-endpoint';
const LAPTOP = 'https://fcm.googleapis.com/fcm/send/laptop-endpoint';
const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };

let ctx;
let alex;
let sam;
let pushedTo;
const open = [];

beforeAll(async () => {
  ctx = await startTestServer();
  alex = await loginAs(ctx.app, USERS.alex);
  sam = await loginAs(ctx.app, USERS.sam);
});
beforeEach(async () => {
  pushedTo = [];
  setPushSender(async (sub) => {
    pushedTo.push(sub.endpoint);
    return { statusCode: 201 };
  });
  await PushSubscription.deleteMany({});
  await PushSubscription.create([
    { userId: sam.user.id, endpoint: PHONE, keys },
    { userId: sam.user.id, endpoint: LAPTOP, keys },
  ]);
});
afterEach(async () => {
  open.splice(0).forEach((s) => s.close());
  setPushSender(null);
  await delay(100);
});
afterAll(() => ctx.close());

async function device(agent, { visible, endpoint }) {
  const socket = await connectSocket(ctx.url, agent.cookie);
  open.push(socket);
  await emitAck(socket, 'presence:visibility', { visible, endpoint });
  return socket;
}

async function alexSends() {
  const socket = await device(alex, { visible: true, endpoint: null });
  await emitAck(socket, 'message:send', { text: 'ping', clientId: clientId() });
  await delay(200);
}

describe('push routing per device', () => {
  it('a laptop showing the chat does not silence the phone', async () => {
    await device(sam, { visible: true, endpoint: LAPTOP });
    await device(sam, { visible: false, endpoint: PHONE });
    await alexSends();
    expect(pushedTo).toEqual([PHONE]);
  });

  it('notifies every device when none has the app on screen', async () => {
    await device(sam, { visible: false, endpoint: LAPTOP });
    await alexSends();
    expect(pushedTo.sort()).toEqual([LAPTOP, PHONE].sort());
  });

  it('notifies every device when the recipient is fully offline', async () => {
    await alexSends();
    expect(pushedTo.sort()).toEqual([LAPTOP, PHONE].sort());
  });

  it('removes registrations the push service reports as expired', async () => {
    setPushSender(async (sub) => {
      if (sub.endpoint === PHONE) throw Object.assign(new Error('gone'), { statusCode: 410 });
      return { statusCode: 201 };
    });
    await alexSends();
    expect(await PushSubscription.exists({ endpoint: PHONE })).toBeNull();
    expect(await PushSubscription.exists({ endpoint: LAPTOP })).not.toBeNull();
  });

  it('call notification has an Answer action; a cancelled call becomes a missed-call notice', async () => {
    const payloads = [];
    setPushSender(async (sub, body) => {
      if (sub.endpoint === PHONE) payloads.push(JSON.parse(body));
      return { statusCode: 201 };
    });
    const caller = await device(alex, { visible: true, endpoint: null });
    const { call } = await emitAck(caller, 'call:initiate', { type: 'audio' });
    await delay(200);
    await emitAck(caller, 'call:end', { callId: call.id });
    await delay(300);

    const [ring, missed] = payloads;
    const tag = `duo-call-${call.id}`;
    expect(ring).toMatchObject({ type: 'call', tag, callId: call.id, body: 'Incoming voice call' });
    expect(ring.actions).toEqual([{ action: 'answer', title: 'Answer' }]);
    expect(missed).toMatchObject({ type: 'missed-call', tag, title: 'Missed voice call', body: 'From Alex · tap to call back' });
  });

  it('rejects non-https endpoints on the socket', async () => {
    const socket = await connectSocket(ctx.url, sam.cookie);
    open.push(socket);
    const res = await emitAck(socket, 'presence:visibility', { visible: true, endpoint: 'http://evil.example/x' });
    expect(res.ok).toBe(false);
  });
});
