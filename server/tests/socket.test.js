import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Message, User } from '../src/models/index.js';
import { USERS, clientId, connectSocket, delay, emitAck, loginAs, startTestServer, waitFor } from './helpers.js';

let ctx;
let alex;
let sam;
const open = [];
const connect = async (agent) => {
  const socket = await connectSocket(ctx.url, agent.cookie);
  open.push(socket);
  return socket;
};

beforeAll(async () => {
  ctx = await startTestServer();
  alex = await loginAs(ctx.app, USERS.alex);
  sam = await loginAs(ctx.app, USERS.sam);
});
afterEach(async () => {
  open.splice(0).forEach((s) => s.close());
  await delay(50);
});
afterAll(() => ctx.close());

describe('socket connection', () => {
  it('rejects connections without a valid session', async () => {
    await expect(connectSocket(ctx.url)).rejects.toThrow('unauthorized');
    await expect(connectSocket(ctx.url, 'duo_session=garbage')).rejects.toThrow('unauthorized');
  });

  it('reports presence on connect and disconnect', async () => {
    const samSocket = await connect(sam);
    const online = waitFor(samSocket, 'user:online');
    const alexSocket = await connect(alex);
    expect((await online).userId).toBe(alex.user.id);

    const state = await waitFor(await connect(sam), 'presence:state');
    expect(state.peer).toMatchObject({ id: alex.user.id, isOnline: true });

    const offline = waitFor(samSocket, 'user:offline');
    alexSocket.close();
    const event = await offline;
    expect(event.userId).toBe(alex.user.id);
    expect(new Date(event.lastSeen).getTime()).toBeGreaterThan(Date.now() - 5000);
    expect((await User.findById(alex.user.id).lean()).isOnline).toBe(false);
  });

  it('stays online while another tab is still connected', async () => {
    const samSocket = await connect(sam);
    const tab1 = await connect(alex);
    await connect(alex);
    let wentOffline = false;
    samSocket.on('user:offline', () => {
      wentOffline = true;
    });
    tab1.close();
    await delay(300);
    expect(wentOffline).toBe(false);
  });
});

describe('realtime messaging', () => {
  it('delivers a message instantly, then delivery and read receipts', async () => {
    const alexSocket = await connect(alex);
    const samSocket = await connect(sam);
    // Let Sam's connect-time "mark pending as delivered" sweep finish first;
    // otherwise it can (correctly) mark the new message delivered straight away.
    await delay(300);

    const incoming = waitFor(samSocket, 'message:new');
    const ack = await emitAck(alexSocket, 'message:send', { text: 'Hey ❤️', clientId: clientId() });
    expect(ack.ok).toBe(true);
    expect(ack.message.status).toBe('sent');

    const received = await incoming;
    expect(received).toMatchObject({ id: ack.message.id, text: 'Hey ❤️', senderId: alex.user.id });

    const delivered = waitFor(alexSocket, 'message:status');
    samSocket.emit('message:delivered', { ids: [received.id] });
    expect(await delivered).toMatchObject({ ids: [received.id], status: 'delivered' });

    const read = waitFor(alexSocket, 'message:status');
    const readAck = await emitAck(samSocket, 'message:read', { upTo: received.id });
    expect(readAck).toMatchObject({ ok: true, count: 1 });
    expect(await read).toMatchObject({ ids: [received.id], status: 'read' });
    expect((await Message.findById(received.id).lean()).status).toBe('read');
  });

  it('marks pending messages delivered when the recipient connects', async () => {
    const alexSocket = await connect(alex);
    const ack = await emitAck(alexSocket, 'message:send', { text: 'while you were away', clientId: clientId() });
    const status = waitFor(alexSocket, 'message:status');
    await connect(sam);
    const event = await status;
    expect(event.status).toBe('delivered');
    expect(event.ids).toContain(ack.message.id);
  });

  it('validates socket payloads', async () => {
    const alexSocket = await connect(alex);
    const bad = await emitAck(alexSocket, 'message:send', { text: { $ne: null }, clientId: clientId() });
    expect(bad.ok).toBe(false);
    expect(bad.error.code).toBe('VALIDATION_ERROR');
    const empty = await emitAck(alexSocket, 'message:send', { text: '  ', clientId: clientId() });
    expect(empty.error.code).toBe('EMPTY_MESSAGE');
  });

  it('cannot join arbitrary rooms', async () => {
    const alexSocket = await connect(alex);
    const samSocket = await connect(sam);
    // There is no join event; unknown events are ignored.
    alexSocket.emit('join', 'conversation:other');
    alexSocket.emit('subscribe', { room: 'user:someone' });
    const ack = await emitAck(alexSocket, 'message:send', { text: 'still private', clientId: clientId() });
    expect(ack.ok).toBe(true);
    expect(samSocket.connected).toBe(true);
  });
});

describe('typing indicator', () => {
  it('relays typing start/stop to the other person only', async () => {
    const alexSocket = await connect(alex);
    const samSocket = await connect(sam);
    let echoed = false;
    alexSocket.on('typing:start', () => {
      echoed = true;
    });

    const start = waitFor(samSocket, 'typing:start');
    alexSocket.emit('typing:start');
    expect((await start).userId).toBe(alex.user.id);

    const stop = waitFor(samSocket, 'typing:stop');
    alexSocket.emit('typing:stop');
    expect((await stop).userId).toBe(alex.user.id);
    expect(echoed).toBe(false);
  });

  it('clears typing when the typist disconnects', async () => {
    const alexSocket = await connect(alex);
    const samSocket = await connect(sam);
    alexSocket.emit('typing:start');
    await waitFor(samSocket, 'typing:start');
    const stop = waitFor(samSocket, 'typing:stop');
    alexSocket.close();
    expect((await stop).userId).toBe(alex.user.id);
  });
});
