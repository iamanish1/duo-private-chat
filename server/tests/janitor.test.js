import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JanitorRun, MediaTrash, Message, Status } from '../src/models/index.js';
import { storage, removeMedia } from '../src/services/storage/index.js';
import { deleteOrphans, runJanitor } from '../src/services/janitorService.js';
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

const dir = () => storage.directory;
const fileOf = (key) => path.join(dir(), key);
const DAY = 24 * 60 * 60 * 1000;

/** A stray file in storage, optionally backdated. */
function strayFile({ ageMs = 0 } = {}) {
  const key = `${crypto.randomBytes(16).toString('hex')}.png`;
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(fileOf(key), PNG_BYTES);
  if (ageMs) {
    const when = new Date(Date.now() - ageMs);
    fs.utimesSync(fileOf(key), when, when);
  }
  return key;
}

const age = (key, ms) => {
  const when = new Date(Date.now() - ms);
  fs.utimesSync(fileOf(key), when, when);
};

describe('storage janitor', () => {
  it('refuses to delete anything when the database references nothing', async () => {
    const stray = strayFile({ ageMs: 3 * DAY });
    const result = await deleteOrphans();
    expect(result.skipped).toMatch(/refusing/);
    expect(fs.existsSync(fileOf(stray))).toBe(true);
    fs.rmSync(fileOf(stray));
  });

  it('deletes old orphaned files but keeps fresh ones and everything still in use', async () => {
    const sent = await alex
      .post('/api/media/upload')
      .field('clientId', clientId())
      .attach('file', PNG_BYTES, { filename: 'p.png', contentType: 'image/png' });
    const inUse = (await Message.findById(sent.body.message.id).lean()).media.key;
    age(inUse, 10 * DAY); // old, but a message still shows it

    const oldOrphan = strayFile({ ageMs: 2 * DAY });
    const freshOrphan = strayFile(); // could be an upload in progress

    const result = await deleteOrphans();
    expect(result.orphansDeleted).toBeGreaterThanOrEqual(1);
    expect(result.bytesFreed).toBeGreaterThanOrEqual(PNG_BYTES.length);
    expect(fs.existsSync(fileOf(oldOrphan))).toBe(false);
    expect(fs.existsSync(fileOf(freshOrphan))).toBe(true);
    expect(fs.existsSync(fileOf(inUse))).toBe(true);
  });

  it('a deletion that fails is remembered and retried until it succeeds', async () => {
    const key = strayFile();
    const realRemove = storage.remove;
    storage.remove = async () => {
      throw new Error('network blip');
    };
    await removeMedia({ key, resourceType: 'image' });
    storage.remove = realRemove;
    expect(fs.existsSync(fileOf(key))).toBe(true);
    expect(await MediaTrash.findOne({ key }).lean()).toMatchObject({ resourceType: 'image', lastError: 'network blip' });

    const run = await runJanitor();
    expect(run.trashCleared).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(fileOf(key))).toBe(false);
    expect(await MediaTrash.findOne({ key })).toBeNull();
  });

  it('expired statuses go (with their files), and replies drop the file pointer', async () => {
    const photo = await alex.post('/api/statuses/media').attach('file', PNG_BYTES, { filename: 's.png', contentType: 'image/png' });
    const status = photo.body.status;
    const statusKey = (await Status.findById(status.id).lean()).media.key;
    const reply = (await sam.post('/api/messages').send({ text: 'nice!', statusId: status.id })).body.message;
    expect((await Message.findById(reply.id).lean()).statusReply.media.key).toBe(statusKey);

    await Status.collection.updateOne({ _id: Status.castObject({ _id: status.id })._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const run = await runJanitor();
    expect(run.statusesRemoved).toBe(1);
    expect(fs.existsSync(fileOf(statusKey))).toBe(false);
    const stored = await Message.findById(reply.id).lean();
    expect(stored.statusReply.media).toBeUndefined();
    expect(stored.statusReply.text).toBe('');
  });

  it('records runs, and the daily orphan scan does not repeat within the day', async () => {
    await JanitorRun.deleteMany({});
    const first = await runJanitor();
    expect(first.orphanScan).toBe(true);
    const second = await runJanitor();
    expect(second.orphanScan).toBeUndefined();
    expect(await JanitorRun.countDocuments({ orphanScan: true })).toBe(1);
  });
});
