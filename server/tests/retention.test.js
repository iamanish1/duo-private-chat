import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Message } from '../src/models/index.js';
import { storage } from '../src/services/storage/index.js';
import { runJanitor } from '../src/services/janitorService.js';
import { PNG_BYTES, USERS, clientId, connectSocket, loginAs, startTestServer, waitFor } from './helpers.js';

// Minimal ISO-BMFF header: detected as video/mp4.
const MP4_BYTES = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from('ftypmp42'), Buffer.from([0, 0, 0, 0]), Buffer.from('mp42isom'), Buffer.alloc(64)]);
const DAY = 24 * 60 * 60 * 1000;

let ctx;
let alex;
let sam;
beforeAll(async () => {
  ctx = await startTestServer();
  alex = await loginAs(ctx.app, USERS.alex);
  sam = await loginAs(ctx.app, USERS.sam);
});
afterAll(() => ctx.close());

const sendVideo = async () =>
  (await alex.post('/api/media/upload').field('clientId', clientId()).field('duration', '3').attach('file', MP4_BYTES, { filename: 'v.mp4', contentType: 'video/mp4' })).body.message;
const sendPhoto = async () =>
  (await alex.post('/api/media/upload').field('clientId', clientId()).attach('file', PNG_BYTES, { filename: 'p.png', contentType: 'image/png' })).body.message;
const ageDays = (id, days) =>
  Message.collection.updateOne({ _id: Message.castObject({ _id: id })._id }, { $set: { createdAt: new Date(Date.now() - days * DAY) } });
const fileOf = async (id) => path.join(storage.directory, (await Message.findById(id).lean()).media.key);

describe('old video clean-up (2 years, videos only)', () => {
  it('a new video says when it will be removed; photos never are', async () => {
    const video = await sendVideo();
    const removesAt = new Date(video.mediaRemovesAt).getTime();
    expect(removesAt - new Date(video.createdAt).getTime()).toBeCloseTo(730 * DAY, -5);
    expect(video).toMatchObject({ kept: false, mediaExpired: false });
    expect((await sendPhoto()).mediaRemovesAt).toBeNull();
  });

  it('either person can "Keep forever" a video; photos and others are refused', async () => {
    const video = await sendVideo();
    const kept = await sam.put(`/api/messages/${video.id}/keep`).send({ keep: true });
    expect(kept.body.message).toMatchObject({ kept: true, mediaRemovesAt: null });
    const unkept = await alex.put(`/api/messages/${video.id}/keep`).send({ keep: false });
    expect(unkept.body.message.kept).toBe(false);
    const photo = await sendPhoto();
    expect((await alex.put(`/api/messages/${photo.id}/keep`).send({ keep: true })).body.error.code).toBe('NOT_REMOVABLE');
    expect((await alex.put(`/api/messages/${video.id}/keep`).send({ keep: 'yes' })).status).toBe(400);
  });

  it('lists videos that will be removed within 30 days (not kept ones)', async () => {
    const soon = await sendVideo();
    const keptSoon = await sendVideo();
    const notYet = await sendVideo();
    await ageDays(soon.id, 710);
    await ageDays(keptSoon.id, 710);
    await ageDays(notYet.id, 600);
    await alex.put(`/api/messages/${keptSoon.id}/keep`).send({ keep: true });

    const ids = (await sam.get('/api/messages/expiring')).body.messages.map((m) => m.id);
    expect(ids).toContain(soon.id);
    expect(ids).not.toContain(keptSoon.id);
    expect(ids).not.toContain(notYet.id);
  });

  it('removes old videos (file gone, message stays), live for both — but not kept videos or old photos', async () => {
    const old = await sendVideo();
    const oldKept = await sendVideo();
    const oldPhoto = await sendPhoto();
    for (const m of [old, oldKept, oldPhoto]) await ageDays(m.id, 731);
    await alex.put(`/api/messages/${oldKept.id}/keep`).send({ keep: true });
    const oldFile = await fileOf(old.id);
    const keptFile = await fileOf(oldKept.id);
    const photoFile = await fileOf(oldPhoto.id);

    const samSocket = await connectSocket(ctx.url, sam.cookie);
    const live = new Promise((resolve) => samSocket.on('message:updated', (m) => m.id === old.id && resolve(m)));
    const run = await runJanitor();
    expect(run.mediaExpired).toBeGreaterThanOrEqual(1);
    expect(await live).toMatchObject({ id: old.id, type: 'video', mediaExpired: true, media: null, mediaRemovesAt: null });
    samSocket.close();

    expect(fs.existsSync(oldFile)).toBe(false);
    expect(fs.existsSync(keptFile)).toBe(true);
    expect(fs.existsSync(photoFile)).toBe(true);
    const stored = await Message.findById(old.id).lean();
    expect(stored.media).toBeUndefined();
    expect(stored.mediaExpiredAt).toBeTruthy();

    // Gone from Photos & videos; keeping it now is refused.
    const listed = (await alex.get('/api/messages/media?type=video')).body.messages.map((m) => m.id);
    expect(listed).not.toContain(old.id);
    expect(listed).toContain(oldKept.id);
    expect((await alex.put(`/api/messages/${old.id}/keep`).send({ keep: true })).body.error.code).toBe('MEDIA_EXPIRED');
  });
});
