import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { User } from '../src/models/index.js';
import { storage } from '../src/services/storage/index.js';
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

describe('profile photo', () => {
  it('uploads a photo and tells the other person in real time', async () => {
    const samSocket = await connectSocket(ctx.url, sam.cookie);
    const updated = waitFor(samSocket, 'user:updated');
    const res = await alex.post('/api/users/me/avatar').attach('file', PNG_BYTES, { filename: 'me.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.user.avatarUrl).toMatch(/^\/api\/media\/file\//);
    expect((await updated).avatarUrl).toBe(res.body.user.avatarUrl);
    expect((await sam.get('/api/conversation')).body.peer.avatarUrl).toBe(res.body.user.avatarUrl);
    samSocket.close();
  });

  it('replacing the photo deletes the old file', async () => {
    const before = await User.findOne({ email: USERS.alex.email }).lean();
    await alex.post('/api/users/me/avatar').attach('file', PNG_BYTES, { filename: 'me2.png', contentType: 'image/png' });
    await new Promise((r) => setTimeout(r, 100));
    expect(fs.existsSync(storage.resolvePath(before.avatar.key))).toBe(false);
  });

  it('removes the photo', async () => {
    const before = await User.findOne({ email: USERS.alex.email }).lean();
    const res = await alex.delete('/api/users/me/avatar');
    expect(res.status).toBe(200);
    expect(res.body.user.avatarUrl).toBeNull();
    await new Promise((r) => setTimeout(r, 100));
    expect(fs.existsSync(storage.resolvePath(before.avatar.key))).toBe(false);
    expect((await alex.delete('/api/users/me/avatar')).status).toBe(200);
  });

  it('rejects non-images and videos as profile photos', async () => {
    const text = await alex.post('/api/users/me/avatar').attach('file', Buffer.from('hello'), { filename: 'x.png', contentType: 'image/png' });
    expect(text.status).toBe(400);
  });
});
