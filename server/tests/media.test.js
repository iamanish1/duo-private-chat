import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Message } from '../src/models/index.js';
import { storage } from '../src/services/storage/index.js';
import { PNG_BYTES, USERS, clientId, loginAs, startTestServer } from './helpers.js';

let ctx;
let alex;
let sam;
beforeAll(async () => {
  ctx = await startTestServer();
  alex = await loginAs(ctx.app, USERS.alex);
  sam = await loginAs(ctx.app, USERS.sam);
});
afterAll(() => ctx.close());

// Minimal ISO-BMFF header: enough for magic-byte detection as video/mp4.
const MP4_BYTES = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftypmp42'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('mp42isom'),
  Buffer.alloc(64),
]);

describe('media uploads', () => {
  it('uploads a valid image, creates an image message, and stores no binary in MongoDB', async () => {
    const res = await alex
      .post('/api/media/upload')
      .field('clientId', clientId())
      .field('text', 'sunset')
      .field('width', '1')
      .field('height', '1')
      .attach('file', PNG_BYTES, { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    const { message } = res.body;
    expect(message).toMatchObject({ type: 'image', text: 'sunset' });
    expect(message.media).toMatchObject({ mimeType: 'image/png', width: 1, height: 1 });
    expect(message.media.url).toMatch(/^\/api\/media\/file\/[a-f\d]{32}\.png$/);

    const stored = await Message.findById(message.id).lean();
    expect(stored.media.key).toMatch(/\.png$/);
    expect(JSON.stringify(stored)).not.toContain(PNG_BYTES.toString('base64'));
    expect(fs.existsSync(storage.resolvePath(stored.media.key))).toBe(true);

    // The recipient can fetch it; anonymous users cannot.
    const file = await sam.get(message.media.url);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect((await request(ctx.app).get(message.media.url)).status).toBe(401);
  });

  it('accepts a video by its contents', async () => {
    const res = await alex
      .post('/api/media/upload')
      .field('duration', '12')
      .attach('file', MP4_BYTES, { filename: 'clip.mp4', contentType: 'video/mp4' });
    expect(res.status).toBe(201);
    expect(res.body.message.type).toBe('video');
    expect(res.body.message.media.duration).toBe(12);
  });

  it('rejects a disguised non-media file', async () => {
    const res = await alex
      .post('/api/media/upload')
      .attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'evil.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
  });

  it('rejects non-media MIME types early', async () => {
    const res = await alex
      .post('/api/media/upload')
      .attach('file', Buffer.from('%PDF-1.4'), { filename: 'doc.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
  });

  it('enforces the image size limit', async () => {
    const big = Buffer.concat([PNG_BYTES, Buffer.alloc(1.5 * 1024 * 1024)]);
    const res = await alex.post('/api/media/upload').attach('file', big, { filename: 'big.png', contentType: 'image/png' });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('enforces the upload limit before buffering everything', async () => {
    const huge = Buffer.concat([MP4_BYTES, Buffer.alloc(3 * 1024 * 1024)]);
    const res = await alex.post('/api/media/upload').attach('file', huge, { filename: 'huge.mp4', contentType: 'video/mp4' });
    expect(res.status).toBe(413);
  });

  it('rejects videos that are too long', async () => {
    const res = await alex
      .post('/api/media/upload')
      .field('duration', '99999')
      .attach('file', MP4_BYTES, { filename: 'long.mp4', contentType: 'video/mp4' });
    expect(res.status).toBe(400);
  });

  it('requires a file and authentication', async () => {
    expect((await alex.post('/api/media/upload').field('text', 'nothing')).status).toBe(400);
    const anon = await request(ctx.app)
      .post('/api/media/upload')
      .set('X-Requested-With', 'XMLHttpRequest')
      .attach('file', PNG_BYTES, { filename: 'p.png', contentType: 'image/png' });
    expect(anon.status).toBe(401);
  });

  it('lists media for the gallery', async () => {
    const res = await sam.get('/api/messages/media?type=image');
    expect(res.status).toBe(200);
    expect(res.body.messages.every((m) => m.type === 'image')).toBe(true);
    expect(res.body.messages.length).toBeGreaterThan(0);
  });

  it('deleting a media message removes the stored file', async () => {
    const upload = await alex.post('/api/media/upload').attach('file', PNG_BYTES, { filename: 'p.png', contentType: 'image/png' });
    const stored = await Message.findById(upload.body.message.id).lean();
    await alex.delete(`/api/messages/${upload.body.message.id}`);
    await new Promise((r) => setTimeout(r, 100));
    expect(fs.existsSync(storage.resolvePath(stored.media.key))).toBe(false);
  });
});

// Minimal EBML/WebM header, as produced by Chrome's MediaRecorder.
const WEBM_BYTES = Buffer.from([
  0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3,
  0x81, 0x08, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d, 0x42, 0x87, 0x81, 0x04, 0x42, 0x85, 0x81, 0x02, ...Array(64).fill(0),
]);

describe('voice notes', () => {
  const sendVoice = (agent, fields = {}, bytes = WEBM_BYTES) => {
    let req = agent.post('/api/media/upload').field('kind', 'voice');
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return req.attach('file', bytes, { filename: 'voice.webm', contentType: 'audio/webm' });
  };

  it('stores a voice note as an audio message with its waveform', async () => {
    const res = await sendVoice(alex, { duration: '7.4', waveform: JSON.stringify([10, 40, 90, 30]), text: 'ignored caption' });
    expect(res.status).toBe(201);
    const { message } = res.body;
    expect(message).toMatchObject({ type: 'audio', text: '' });
    expect(message.media).toMatchObject({ mimeType: 'audio/webm', duration: 7.4, waveform: [10, 40, 90, 30], thumbnailUrl: null });
    const file = await sam.get(message.media.url);
    expect(file.status).toBe(200);
  });

  it('requires a duration within the limit', async () => {
    expect((await sendVoice(alex)).status).toBe(400);
    const tooLong = await sendVoice(alex, { duration: '9999' });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.code).toBe('VOICE_TOO_LONG');
  });

  it('rejects non-audio content and malformed waveforms', async () => {
    const png = await sendVoice(alex, { duration: '3' }, PNG_BYTES);
    expect(png.body.error.code).toBe('INVALID_FILE_TYPE');
    expect((await sendVoice(alex, { duration: '3', waveform: '[500]' })).status).toBe(400);
    expect((await sendVoice(alex, { duration: '3', waveform: 'not json' })).status).toBe(400);
  });
});
