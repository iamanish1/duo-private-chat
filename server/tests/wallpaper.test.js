import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Conversation } from '../src/models/index.js';
import { storage } from '../src/services/storage/index.js';
import { deleteOrphans } from '../src/services/janitorService.js';
import { PNG_BYTES, USERS, connectSocket, loginAs, startTestServer, waitFor } from './helpers.js';

let ctx;
let alex;
let sam;
beforeAll(async () => {
  ctx = await startTestServer();
  alex = await loginAs(ctx.app, USERS.alex);
  sam = await loginAs(ctx.app, USERS.sam);
});
afterAll(() => ctx.close());

const set = (agent, body) => agent.put('/api/conversation/wallpaper').send(body);
const photoKey = async () => (await Conversation.findOne().lean()).wallpaper?.imageKey;

describe('shared chat background', () => {
  it('starts as the default for both', async () => {
    const { conversation } = (await sam.get('/api/conversation')).body;
    expect(conversation.wallpaper).toMatchObject({ kind: 'default', imageUrl: null });
  });

  it('either person sets a preset; the other sees it live, with who changed it', async () => {
    const s = await connectSocket(ctx.url, sam.cookie);
    const live = waitFor(s, 'conversation:wallpaper');
    const res = await set(alex, { kind: 'gradient', value: 'sunset', dim: 0 });
    expect(res.body.wallpaper).toMatchObject({ kind: 'gradient', value: 'sunset', updatedBy: alex.user.id });
    expect(await live).toMatchObject({ by: alex.user.id, wallpaper: { kind: 'gradient', value: 'sunset' } });
    s.close();
    expect((await sam.get('/api/conversation')).body.conversation.wallpaper).toMatchObject({ kind: 'gradient', value: 'sunset' });

    // And Sam can change it back.
    expect((await set(sam, { kind: 'color', value: 'sage' })).body.wallpaper).toMatchObject({ kind: 'color', value: 'sage', updatedBy: sam.user.id });
  });

  it('rejects unknown values and out-of-range dimming', async () => {
    expect((await set(alex, { kind: 'color', value: 'url(javascript:alert(1))' })).status).toBe(400);
    expect((await set(alex, { kind: 'color', value: 'sage', dim: 99 })).status).toBe(400);
    expect((await set(alex, { kind: 'neon', value: 'x' })).status).toBe(400);
    expect((await set(alex, { kind: 'color' })).body.error.code).toBe('VALIDATION_ERROR');
    expect((await set(alex, { kind: 'photo', dim: 20 })).body.error.code).toBe('NO_PHOTO');
  });

  it('a photo background: upload, dim it, replace it (old file deleted), reset', async () => {
    const res = await sam.post('/api/conversation/wallpaper/photo').field('dim', '30').attach('file', PNG_BYTES, { filename: 'bg.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.wallpaper).toMatchObject({ kind: 'photo', dim: 30, updatedBy: sam.user.id });
    expect(res.body.wallpaper.imageUrl).toBeTruthy();
    const key = await photoKey();
    expect(fs.existsSync(path.join(storage.directory, key))).toBe(true);

    expect((await set(alex, { kind: 'photo', dim: 50 })).body.wallpaper).toMatchObject({ kind: 'photo', dim: 50 });
    expect(await photoKey()).toBe(key);

    // The storage cleaner must never treat the background as an orphan.
    const when = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    fs.utimesSync(path.join(storage.directory, key), when, when);
    await deleteOrphans();
    expect(fs.existsSync(path.join(storage.directory, key))).toBe(true);

    await set(alex, { kind: 'default' });
    await new Promise((r) => setTimeout(r, 100));
    expect(fs.existsSync(path.join(storage.directory, key))).toBe(false);
    expect((await sam.get('/api/conversation')).body.conversation.wallpaper.kind).toBe('default');
  });

  it('only images can be a background', async () => {
    const res = await alex.post('/api/conversation/wallpaper/photo').attach('file', Buffer.from('not an image'), { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });
});
