import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Message } from '../src/models/index.js';
import { USERS, clientId, loginAs, startTestServer } from './helpers.js';

let ctx;
let alex;
let sam;
beforeAll(async () => {
  ctx = await startTestServer();
  alex = await loginAs(ctx.app, USERS.alex);
  sam = await loginAs(ctx.app, USERS.sam);
});
afterAll(() => ctx.close());

describe('messages', () => {
  it('sends a text message that persists in MongoDB', async () => {
    const res = await alex.post('/api/messages').send({ text: '  Hey ❤️  ', clientId: clientId() });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatchObject({ text: 'Hey ❤️', type: 'text', status: 'sent', senderId: alex.user.id, receiverId: sam.user.id });
    expect(await Message.countDocuments({ _id: res.body.message.id })).toBe(1);
  });

  it('is idempotent per clientId', async () => {
    const id = clientId();
    const first = await alex.post('/api/messages').send({ text: 'once', clientId: id });
    const second = await alex.post('/api/messages').send({ text: 'once', clientId: id });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.message.id).toBe(first.body.message.id);
  });

  it('rejects empty, oversized and non-string text', async () => {
    expect((await alex.post('/api/messages').send({ text: '   ' })).status).toBe(400);
    expect((await alex.post('/api/messages').send({ text: 'x'.repeat(4001) })).status).toBe(400);
    expect((await alex.post('/api/messages').send({ text: { $gt: '' } })).status).toBe(400);
  });

  it('the recipient sees it and can mark it read', async () => {
    const sent = (await alex.post('/api/messages').send({ text: 'read me' })).body.message;
    const list = await sam.get('/api/messages');
    expect(list.body.messages.some((m) => m.id === sent.id)).toBe(true);

    const read = await sam.patch(`/api/messages/${sent.id}/read`);
    expect(read.status).toBe(200);
    expect(read.body.ids).toContain(sent.id);
    const stored = await Message.findById(sent.id).lean();
    expect(stored.status).toBe('read');
    expect(stored.readAt).toBeInstanceOf(Date);
    expect(stored.deliveredAt).toBeInstanceOf(Date);
  });

  it('a sender cannot mark their own message read', async () => {
    const sent = (await alex.post('/api/messages').send({ text: 'mine' })).body.message;
    const res = await alex.patch(`/api/messages/${sent.id}/read`);
    expect(res.body.ids).toEqual([]);
    expect((await Message.findById(sent.id).lean()).status).toBe('sent');
  });

  it('paginates with a cursor and keeps chronological order', async () => {
    await Message.deleteMany({});
    for (let i = 0; i < 45; i += 1) await alex.post('/api/messages').send({ text: `msg ${i}` });

    const first = await sam.get('/api/messages?limit=40');
    expect(first.body.messages).toHaveLength(40);
    expect(first.body.hasMore).toBe(true);
    expect(first.body.messages.at(-1).text).toBe('msg 44');

    const older = await sam.get(`/api/messages?limit=40&before=${first.body.messages[0].id}`);
    expect(older.body.messages.map((m) => m.text)).toEqual(['msg 0', 'msg 1', 'msg 2', 'msg 3', 'msg 4']);
    expect(older.body.hasMore).toBe(false);

    const newer = await sam.get(`/api/messages?after=${first.body.messages.at(-3).id}`);
    expect(newer.body.messages.map((m) => m.text)).toEqual(['msg 43', 'msg 44']);
  });

  it('validates ids and cursors', async () => {
    expect((await sam.get('/api/messages?before=nope')).status).toBe(400);
    expect((await sam.patch('/api/messages/123/read')).status).toBe(400);
    expect((await sam.patch('/api/messages/650000000000000000000000/read')).status).toBe(404);
  });

  it('only the sender can delete, and deletion wipes content', async () => {
    const sent = (await alex.post('/api/messages').send({ text: 'secret' })).body.message;
    expect((await sam.delete(`/api/messages/${sent.id}`)).status).toBe(403);
    const res = await alex.delete(`/api/messages/${sent.id}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatchObject({ deleted: true, text: '' });
    expect((await Message.findById(sent.id).lean()).text).toBe('');
  });

  it('supports replies and one reaction per person', async () => {
    const original = (await alex.post('/api/messages').send({ text: 'original' })).body.message;
    const reply = await sam.post('/api/messages').send({ text: 'reply', replyTo: original.id });
    expect(reply.body.message.replyTo).toMatchObject({ id: original.id, text: 'original' });

    await sam.put(`/api/messages/${original.id}/reaction`).send({ emoji: '❤️' });
    const swapped = await sam.put(`/api/messages/${original.id}/reaction`).send({ emoji: '😂' });
    expect(swapped.body.message.reactions).toEqual([{ userId: sam.user.id, emoji: '😂' }]);
    const removed = await sam.put(`/api/messages/${original.id}/reaction`).send({ emoji: null });
    expect(removed.body.message.reactions).toEqual([]);
    expect((await sam.put(`/api/messages/${original.id}/reaction`).send({ emoji: 'not emoji' })).status).toBe(400);
  });

  it('searches text safely (regex characters are literal)', async () => {
    await alex.post('/api/messages').send({ text: 'Dinner at 8.30?' });
    const hit = await sam.get(`/api/messages/search?q=${encodeURIComponent('8.30?')}`);
    expect(hit.body.messages.map((m) => m.text)).toContain('Dinner at 8.30?');
    const wildcard = await sam.get(`/api/messages/search?q=${encodeURIComponent('.*')}`);
    expect(wildcard.body.messages).toHaveLength(0);
    const byDate = await sam.get('/api/messages/search?from=2000-01-01&to=2000-12-31');
    expect(byDate.body.messages).toHaveLength(0);
  });
});
