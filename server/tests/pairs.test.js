import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Conversation, User } from '../src/models/index.js';
import { seedAuthorizedUsers } from '../scripts/seedLib.js';
import { USERS, clientId, connectSocket, delay, emitAck, loginAs, startTestServer } from './helpers.js';

const TAYLOR = { email: 'taylor@example.com', name: 'Taylor', password: 'taylor-password-1' };
const JORDAN = { email: 'jordan@example.com', name: 'Jordan', password: 'jordan-password-2' };

let ctx;
let alex;
let sam;
let taylor;
let jordan;

beforeAll(async () => {
  ctx = await startTestServer();
  await seedAuthorizedUsers([USERS.alex, USERS.sam, TAYLOR, JORDAN]);
  [alex, sam, taylor, jordan] = await Promise.all([USERS.alex, USERS.sam, TAYLOR, JORDAN].map((u) => loginAs(ctx.app, u)));
});
afterAll(() => ctx.close());

describe('separate private pairs', () => {
  it('gives each pair its own conversation and peer', async () => {
    expect((await alex.get('/api/conversation')).body.peer.name).toBe('Sam');
    expect((await taylor.get('/api/conversation')).body.peer.name).toBe('Jordan');
    expect((await jordan.get('/api/conversation')).body.peer.name).toBe('Taylor');
    expect(await Conversation.countDocuments()).toBe(2);
  });

  it("never shows one pair's messages, statuses, lists or dates to the other", async () => {
    const sent = await alex.post('/api/messages').send({ clientId: clientId(), text: 'only for Sam' });
    expect(sent.status).toBe(201);
    expect((await alex.post('/api/statuses').send({ text: 'Alex status', background: 3 })).status).toBe(201);
    expect((await alex.post('/api/lists').send({ name: 'Alex & Sam list', emoji: '🎬' })).status).toBe(201);
    expect((await alex.put('/api/together/since').send({ since: '2024-01-01' })).status).toBe(200);
    expect(JSON.stringify((await sam.get('/api/statuses')).body)).toContain('Alex status');
    expect(JSON.stringify((await sam.get('/api/lists')).body)).toContain('Alex & Sam list');

    expect((await sam.get('/api/messages')).body.messages.map((m) => m.text)).toContain('only for Sam');
    for (const other of [taylor, jordan]) {
      expect((await other.get('/api/messages')).body.messages).toHaveLength(0);
      expect((await other.get('/api/messages/search?q=only')).body.messages ?? []).toHaveLength(0);
      expect(JSON.stringify((await other.get('/api/statuses')).body)).not.toContain('Alex status');
      expect(JSON.stringify((await other.get('/api/lists')).body)).not.toContain('Alex & Sam list');
      expect((await other.get('/api/together')).body.together?.since ?? null).toBeNull();
    }
  });

  it("refuses to read, react to, edit or delete the other pair's message by id", async () => {
    const { body } = await alex.post('/api/messages').send({ clientId: clientId(), text: 'private' });
    const id = body.message.id;
    const attempts = [
      await taylor.patch(`/api/messages/${id}/read`),
      await taylor.put(`/api/messages/${id}/reaction`).send({ emoji: '❤️' }),
      await taylor.patch(`/api/messages/${id}`).send({ text: 'hacked' }),
      await taylor.delete(`/api/messages/${id}`),
    ];
    for (const res of attempts) expect(res.status, res.req.path).toBeGreaterThanOrEqual(400);
    const after = (await sam.get('/api/messages')).body.messages.find((m) => m.id === id);
    expect(after.text).toBe('private');
    expect(after.reactions).toHaveLength(0);
  });

  it('keeps realtime events inside each pair', async () => {
    const taylorSocket = await connectSocket(ctx.url, taylor.cookie);
    const jordanSocket = await connectSocket(ctx.url, jordan.cookie);
    const alexSocket = await connectSocket(ctx.url, alex.cookie);
    const leaked = [];
    const samSocket = await connectSocket(ctx.url, sam.cookie);
    const samGot = [];
    samSocket.onAny((event, payload) => JSON.stringify(payload ?? '').includes('socket secret') && samGot.push(event));
    for (const s of [taylorSocket, jordanSocket]) s.onAny((event, payload) => JSON.stringify(payload ?? '').includes('socket secret') && leaked.push(event));
    await delay(300);
    const res = await emitAck(alexSocket, 'message:send', { clientId: clientId(), text: 'socket secret' });
    expect(res.ok).toBe(true);
    await alex.post('/api/nudge');
    await delay(800);
    expect(samGot).toContain('message:new');
    expect(leaked).toEqual([]);
    [taylorSocket, jordanSocket, alexSocket, samSocket].forEach((s) => s.close());
  });

  it('the database refuses to put a person in a second conversation', async () => {
    const [a, t] = await Promise.all([User.findOne({ email: USERS.alex.email }), User.findOne({ email: TAYLOR.email })]);
    await expect(Conversation.create({ participants: [a._id, t._id] })).rejects.toThrow(/duplicate key/);
    expect(await Conversation.countDocuments()).toBe(2);
  });

  it('seeding again changes nothing', async () => {
    const again = await seedAuthorizedUsers([USERS.alex, USERS.sam, TAYLOR, JORDAN]);
    expect(again.log.filter((l) => /already exists/.test(l))).toHaveLength(6);
    expect(await Conversation.countDocuments()).toBe(2);
  });
});
