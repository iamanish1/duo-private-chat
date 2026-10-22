import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Message } from '../src/models/index.js';
import { USERS, clientId, connectSocket, loginAs, startTestServer, waitFor } from './helpers.js';

let ctx;
let alex;
let sam;

beforeAll(async () => {
  ctx = await startTestServer();
  alex = await loginAs(ctx.app, USERS.alex);
  sam = await loginAs(ctx.app, USERS.sam);
});
afterAll(() => ctx.close());

const send = async (agent, text) => (await agent.post('/api/messages').send({ clientId: clientId(), text })).body.message;

describe('pinned messages', () => {
  it('pins several messages with optional titles; both see them newest first', async () => {
    const a = await send(alex, 'Hotel: Sea View, room 204');
    const b = await send(sam, 'Flight 6E 2134 at 7:40');
    const c = await send(alex, 'not pinned');

    const first = await alex.put(`/api/messages/${a.id}/pin`).send({ title: '  Trip hotel  ' });
    expect(first.status).toBe(200);
    expect(first.body.message.pin).toMatchObject({ by: alex.user.id, title: 'Trip hotel' });
    expect((await sam.put(`/api/messages/${b.id}/pin`).send({})).body.message.pin.title).toBe('');

    const list = (await sam.get('/api/messages/pinned')).body.messages;
    expect(list.map((m) => m.id)).toEqual([b.id, a.id]);
    expect(list.map((m) => m.id)).not.toContain(c.id);
    expect((await alex.get('/api/messages/pinned')).body.messages).toHaveLength(2);
  });

  it('renames a pin without moving it, and unpins', async () => {
    const m = await send(alex, 'Wifi password: sunflower42');
    const pinned = (await alex.put(`/api/messages/${m.id}/pin`).send({ title: 'Wifi' })).body.message.pin;
    const renamed = (await sam.put(`/api/messages/${m.id}/pin`).send({ title: 'Home wifi' })).body.message.pin;
    expect(renamed.title).toBe('Home wifi');
    expect(renamed.at).toBe(pinned.at);
    expect(renamed.by).toBe(alex.user.id);

    expect((await sam.delete(`/api/messages/${m.id}/pin`)).body.message.pin).toBeNull();
    expect((await alex.get('/api/messages/pinned')).body.messages.map((x) => x.id)).not.toContain(m.id);
  });

  it('tells the other person live', async () => {
    const m = await send(alex, 'live pin');
    const samSocket = await connectSocket(ctx.url, sam.cookie);
    const update = waitFor(samSocket, 'message:updated');
    await alex.put(`/api/messages/${m.id}/pin`).send({ title: 'Live' });
    expect((await update).pin).toMatchObject({ title: 'Live', by: alex.user.id });
    const removed = waitFor(samSocket, 'message:updated');
    await alex.delete(`/api/messages/${m.id}/pin`);
    expect(await removed).toMatchObject({ pin: null, unpinnedBy: alex.user.id });
    samSocket.close();
  });

  it('drops the pin when the message is deleted, and refuses to pin deleted messages', async () => {
    const m = await send(alex, 'oops');
    await alex.put(`/api/messages/${m.id}/pin`).send({});
    const deleted = (await alex.delete(`/api/messages/${m.id}`)).body.message;
    expect(deleted.pin).toBeNull();
    expect((await alex.get('/api/messages/pinned')).body.messages.map((x) => x.id)).not.toContain(m.id);
    expect((await sam.put(`/api/messages/${m.id}/pin`).send({})).body.error.code).toBe('MESSAGE_DELETED');
  });

  it('validates titles and unknown messages', async () => {
    const m = await send(alex, 'title check');
    expect((await alex.put(`/api/messages/${m.id}/pin`).send({ title: 'x'.repeat(61) })).status).toBe(400);
    expect((await alex.put('/api/messages/0123456789abcdef01234567/pin').send({})).status).toBe(404);
    expect(await Message.countDocuments({ 'pin.at': { $exists: true } })).toBeGreaterThan(0);
  });
});
