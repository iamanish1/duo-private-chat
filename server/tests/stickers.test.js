import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Message, Sticker } from '../src/models/index.js';
import { setGiphyApiKey } from '../src/services/stickerService.js';
import { storage } from '../src/services/storage/index.js';
import { deleteOrphans } from '../src/services/janitorService.js';
import { PNG_BYTES, USERS, clientId, connectSocket, emitAck, loginAs, startTestServer, waitFor } from './helpers.js';

let ctx;
let alex;
let sam;
const open = [];
const connect = async (agent) => {
  const s = await connectSocket(ctx.url, agent.cookie);
  open.push(s);
  return s;
};
beforeAll(async () => {
  ctx = await startTestServer();
  alex = await loginAs(ctx.app, USERS.alex);
  sam = await loginAs(ctx.app, USERS.sam);
});
afterEach(() => {
  open.splice(0).forEach((s) => s.close());
  vi.unstubAllGlobals();
  setGiphyApiKey(null);
});
afterAll(() => ctx.close());

const GIF = { kind: 'gif', id: 'xT9IgG50Fb7Mi0prBC', url: 'https://media2.giphy.com/media/xT9IgG50Fb7Mi0prBC/200w.webp?cid=abc&rid=200w.webp&ct=g', width: 200, height: 150, title: 'happy dance' };
const send = (socket, sticker) => emitAck(socket, 'message:send', { text: '', clientId: clientId(), sticker });

describe('stickers', () => {
  it('sends an animated emoji sticker; the other person gets it live', async () => {
    const a = await connect(alex);
    const s = await connect(sam);
    const live = waitFor(s, 'message:new');
    const res = await send(a, { kind: 'emoji', code: '1f602' });
    expect(res.ok).toBe(true);
    expect(res.message).toMatchObject({ type: 'sticker', text: '', sticker: { kind: 'emoji', code: '1f602' } });
    expect((await live).sticker.code).toBe('1f602');
  });

  it('sends a GIF, and refuses GIF links that are not from GIPHY', async () => {
    const a = await connect(alex);
    const res = await send(a, GIF);
    expect(res.message.sticker).toMatchObject({ kind: 'gif', gifId: GIF.id, url: GIF.url, width: 200, height: 150, title: 'happy dance' });
    for (const url of ['https://evil.example/x.gif', 'http://media.giphy.com/media/x/y.gif', 'https://media.giphy.com.evil.io/media/x/y.gif', 'javascript:alert(1)']) {
      expect((await send(a, { ...GIF, url })).ok).toBe(false);
    }
    expect((await send(a, { kind: 'emoji', code: '<img>' })).ok).toBe(false);
  });

  it('a shared sticker tray: either person adds, both see it live, and it can be sent', async () => {
    const s = await connect(sam);
    const added = waitFor(s, 'sticker:added');
    const res = await alex.post('/api/stickers').attach('file', PNG_BYTES, { filename: 'sticker.webp', contentType: 'image/png' });
    expect(res.status).toBe(201);
    const { sticker } = res.body;
    expect(sticker.url).toBeTruthy();
    expect((await added).id).toBe(sticker.id);
    expect((await sam.get('/api/stickers')).body.stickers.map((x) => x.id)).toContain(sticker.id);

    const sent = await send(s, { kind: 'custom', id: sticker.id });
    expect(sent.message.sticker).toMatchObject({ kind: 'custom', url: sticker.url });
    expect((await send(s, { kind: 'custom', id: '64b000000000000000000001' })).error.code).toBe('STICKER_NOT_FOUND');
  });

  it('removing from the tray keeps it in old messages (the file stays while used)', async () => {
    const { sticker } = (await alex.post('/api/stickers').attach('file', PNG_BYTES, { filename: 's.webp', contentType: 'image/png' })).body;
    const a = await connect(alex);
    const msg = (await send(a, { kind: 'custom', id: sticker.id })).message;
    const key = (await Sticker.findById(sticker.id).lean()).key;
    const s = await connect(sam);
    const removed = waitFor(s, 'sticker:removed');
    expect((await sam.delete(`/api/stickers/${sticker.id}`)).status).toBe(204);
    expect((await removed).id).toBe(sticker.id);

    const file = path.join(storage.directory, key);
    const old = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    fs.utimesSync(file, old, old);
    await deleteOrphans();
    expect(fs.existsSync(file)).toBe(true); // still shown in the chat
    expect((await Message.findById(msg.id).lean()).sticker.key).toBe(key);
  });

  it('only images can become stickers; stickers cannot be edited; deleting clears them', async () => {
    expect((await alex.post('/api/stickers').attach('file', Buffer.from('nope'), { filename: 'x.webp', contentType: 'image/webp' })).status).toBe(400);
    const a = await connect(alex);
    const msg = (await send(a, { kind: 'emoji', code: '2764_fe0f' })).message;
    expect((await alex.patch(`/api/messages/${msg.id}`).send({ text: 'hi' })).body.error.code).toBe('NOT_EDITABLE');
    const deleted = await alex.delete(`/api/messages/${msg.id}`);
    expect(deleted.body.message).toMatchObject({ deleted: true, sticker: null });
  });

  it('GIF search goes through the server (key stays private), is cached, and explains when not set up', async () => {
    expect((await alex.get('/api/gifs?q=hug')).body.error.code).toBe('GIFS_NOT_CONFIGURED');

    setGiphyApiKey('test-key');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { id: 'abc123', title: 'Hug GIF', images: { fixed_width: { webp: 'https://media1.giphy.com/media/abc123/200w.webp?cid=1&ct=g', width: '200', height: '180' } } },
          { id: 'bad', title: 'x', images: { fixed_width: { webp: 'https://evil.example/x.webp', width: '1', height: '1' } } },
        ],
        pagination: { total_count: 50, count: 2, offset: 0 },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await alex.get('/api/gifs?q=Hug');
    expect(res.body.gifs).toEqual([{ id: 'abc123', title: 'Hug GIF', url: 'https://media1.giphy.com/media/abc123/200w.webp?cid=1&ct=g', width: 200, height: 180 }]);
    expect(res.body.hasMore).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('test-key');
    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain('/v1/gifs/search?');
    expect(calledUrl).toContain('rating=pg-13');
    await alex.get('/api/gifs?q=hug');
    expect(fetchMock).toHaveBeenCalledTimes(1); // cached (case-insensitive)
    await alex.get('/api/gifs');
    expect(fetchMock.mock.calls[1][0]).toContain('/v1/gifs/trending?');
  });
});
