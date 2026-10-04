import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Message } from '../src/models/index.js';
import { USERS, connectSocket, loginAs, startTestServer, waitFor } from './helpers.js';

let ctx;
let alex;
let sam;
beforeAll(async () => {
  ctx = await startTestServer();
  alex = await loginAs(ctx.app, USERS.alex);
  sam = await loginAs(ctx.app, USERS.sam);
});
afterAll(() => ctx.close());

const send = async (text) => (await alex.post('/api/messages').send({ text })).body.message;
const edit = (agent, id, text) => agent.patch(`/api/messages/${id}`).send({ text });

describe('editing messages', () => {
  it('the sender corrects a message; the other person gets the update live', async () => {
    const original = await send('See you at 7 tomorow');
    const samSocket = await connectSocket(ctx.url, sam.cookie);
    const updated = waitFor(samSocket, 'message:updated');

    const res = await edit(alex, original.id, '  See you at 7 tomorrow  ');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatchObject({ id: original.id, text: 'See you at 7 tomorrow' });
    expect(res.body.message.editedAt).toBeTruthy();
    expect((await updated).text).toBe('See you at 7 tomorrow');
    samSocket.close();

    const stored = await Message.findById(original.id).lean();
    expect(stored.text).toBe('See you at 7 tomorrow');
  });

  it('only the sender can edit', async () => {
    const msg = await send('mine');
    const res = await edit(sam, msg.id, 'hijacked');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_SENDER');
  });

  it('rejects empty text and oversized text', async () => {
    const msg = await send('hello');
    expect((await edit(alex, msg.id, '   ')).body.error.code).toBe('EMPTY_MESSAGE');
    expect((await edit(alex, msg.id, 'x'.repeat(4001))).status).toBe(400);
  });

  it('is only possible for 15 minutes', async () => {
    const msg = await send('old one');
    // Bypass Mongoose (createdAt is immutable there) to age the message.
    await Message.collection.updateOne({ _id: new Message({ _id: msg.id })._id }, { $set: { createdAt: new Date(Date.now() - 16 * 60 * 1000) } });
    const res = await edit(alex, msg.id, 'changed');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: 'EDIT_WINDOW_PASSED', message: 'Messages can only be edited for 15 minutes after sending.' });
  });

  it('cannot edit a deleted message', async () => {
    const msg = await send('to delete');
    await alex.delete(`/api/messages/${msg.id}`);
    expect((await edit(alex, msg.id, 'back')).body.error.code).toBe('MESSAGE_DELETED');
  });

  it('edits photo captions (and can clear them) but not voice notes', async () => {
    const base = { conversationId: (await Message.findById((await send('x')).id)).conversationId, senderId: alex.user.id, receiverId: sam.user.id };
    const photo = await Message.create({ ...base, type: 'image', text: 'sunst', media: { key: 'k.png', resourceType: 'image', mimeType: 'image/png', size: 1 } });
    const fixed = await edit(alex, String(photo._id), 'sunset');
    expect(fixed.body.message.text).toBe('sunset');
    expect((await edit(alex, String(photo._id), '')).body.message.text).toBe('');

    const voice = await Message.create({ ...base, type: 'audio', media: { key: 'v.webm', resourceType: 'audio', mimeType: 'audio/webm', size: 1 } });
    expect((await edit(alex, String(voice._id), 'hi')).body.error.code).toBe('NOT_EDITABLE');
  });

  it('saving the same text does not mark it edited', async () => {
    const msg = await send('unchanged');
    const res = await edit(alex, msg.id, 'unchanged');
    expect(res.body.message.editedAt).toBeNull();
  });
});
