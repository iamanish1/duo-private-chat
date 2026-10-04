import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Message, Status } from '../src/models/index.js';
import { sweepExpiredStatuses } from '../src/services/statusService.js';
import { PNG_BYTES, USERS, clientId, connectSocket, emitAck, loginAs, startTestServer, waitFor } from './helpers.js';

let ctx;
let alex;
let sam;
beforeAll(async () => {
  ctx = await startTestServer();
  alex = await loginAs(ctx.app, USERS.alex);
  sam = await loginAs(ctx.app, USERS.sam);
});
afterAll(() => ctx.close());

const post = (agent, body) => agent.post('/api/statuses').send(body);
const age = (id) => Status.collection.updateOne({ _id: Status.castObject({ _id: id })._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

describe('statuses', () => {
  it('posting a text status reaches the other person live and lasts 24 hours', async () => {
    const samSocket = await connectSocket(ctx.url, sam.cookie);
    const live = waitFor(samSocket, 'status:new');
    const res = await post(alex, { text: '  Beach day ☀️  ', background: 3 });
    expect(res.status).toBe(201);
    expect(res.body.status).toMatchObject({ type: 'text', text: 'Beach day ☀️', background: 3, viewedAt: null });
    const hours = (new Date(res.body.status.expiresAt) - new Date(res.body.status.createdAt)) / 3_600_000;
    expect(hours).toBeCloseTo(24, 1);
    expect((await live).id).toBe(res.body.status.id);
    samSocket.close();

    const list = await sam.get('/api/statuses');
    expect(list.body.statuses.map((s) => s.id)).toContain(res.body.status.id);
  });

  it('rejects empty and oversized text statuses', async () => {
    expect((await post(alex, { text: '   ' })).body.error.code).toBe('EMPTY_STATUS');
    expect((await post(alex, { text: 'x'.repeat(701) })).status).toBe(400);
    expect((await post(alex, { text: 'hi', background: 99 })).status).toBe(400);
  });

  it('photo statuses upload with a caption', async () => {
    const res = await alex
      .post('/api/statuses/media')
      .field('text', 'sunset')
      .attach('file', PNG_BYTES, { filename: 'p.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.status).toMatchObject({ type: 'image', text: 'sunset' });
    expect(res.body.status.media.url).toBeTruthy();
  });

  it('the owner learns when the other person has seen it; only the first view counts', async () => {
    const { status } = (await post(alex, { text: 'seen test' })).body;
    // The owner looking at their own status is not a "seen".
    expect((await alex.post(`/api/statuses/${status.id}/view`)).body.status.viewedAt).toBeNull();

    const alexSocket = await connectSocket(ctx.url, alex.cookie);
    const seen = waitFor(alexSocket, 'status:viewed');
    const first = await sam.post(`/api/statuses/${status.id}/view`);
    expect(first.body.status.viewedAt).toBeTruthy();
    expect(await seen).toMatchObject({ id: status.id, viewedAt: first.body.status.viewedAt });
    alexSocket.close();

    const again = await sam.post(`/api/statuses/${status.id}/view`);
    expect(again.body.status.viewedAt).toBe(first.body.status.viewedAt);
    const mine = (await alex.get('/api/statuses')).body.statuses.find((s) => s.id === status.id);
    expect(mine.viewedAt).toBe(first.body.status.viewedAt);
  });

  it('only the owner can delete; deletion reaches the other person', async () => {
    const { status } = (await post(alex, { text: 'delete me' })).body;
    expect((await sam.delete(`/api/statuses/${status.id}`)).body.error.code).toBe('NOT_OWNER');
    const samSocket = await connectSocket(ctx.url, sam.cookie);
    const gone = waitFor(samSocket, 'status:deleted');
    expect((await alex.delete(`/api/statuses/${status.id}`)).status).toBe(204);
    expect((await gone).id).toBe(status.id);
    samSocket.close();
    expect(await Status.findById(status.id)).toBeNull();
  });

  it('expired statuses are hidden, cannot be viewed, and are swept with their files', async () => {
    const { status } = (await post(alex, { text: 'old news' })).body;
    await age(status.id);
    const list = await sam.get('/api/statuses');
    expect(list.body.statuses.map((s) => s.id)).not.toContain(status.id);
    expect((await sam.post(`/api/statuses/${status.id}/view`)).status).toBe(404);
    expect(await sweepExpiredStatuses()).toBeGreaterThanOrEqual(1);
    expect(await Status.findById(status.id)).toBeNull();
  });

  it('replying to a status sends a chat message that quotes it', async () => {
    const { status } = (await post(alex, { text: 'New haircut!', background: 2 })).body;
    const alexSocket = await connectSocket(ctx.url, alex.cookie);
    const samSocket = await connectSocket(ctx.url, sam.cookie);
    const incoming = waitFor(alexSocket, 'message:new');
    const ack = await emitAck(samSocket, 'message:send', { text: 'Looks great 😍', clientId: clientId(), statusId: status.id });
    expect(ack.ok).toBe(true);
    expect(ack.message.statusReply).toMatchObject({ statusId: status.id, type: 'text', text: 'New haircut!', background: 2, expired: false });
    expect((await incoming).statusReply.ownerId).toBe(ack.message.receiverId);
    alexSocket.close();
    samSocket.close();

    // You can't "reply" to your own status, or to one that's gone.
    const own = await alex.post('/api/messages').send({ text: 'hm', statusId: status.id });
    expect(own.body.error.code).toBe('STATUS_NOT_FOUND');

    // After deletion the quote stays but is marked expired.
    await alex.delete(`/api/statuses/${status.id}`);
    const stored = await Message.findById(ack.message.id).lean();
    const page = (await sam.get('/api/messages')).body.messages.find((m) => m.id === String(stored._id));
    expect(page.statusReply).toMatchObject({ text: 'New haircut!', expired: true, thumbnailUrl: null });
  });
});
