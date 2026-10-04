import { Conversation, JanitorRun, MediaTrash, Message, Song, Status, User } from '../models/index.js';
import { logger } from '../utils/logger.js';
import { storage } from './storage/index.js';
import { sweepExpiredStatuses } from './statusService.js';
import { expireOldMedia } from './messageService.js';

// Storage janitor: keeps the database and object storage lean.
//  - hourly: delete expired statuses (+ files) and retry failed deletions
//  - daily:  delete stored files nothing in the database points to
//           (crashed uploads, old wipes), with conservative safety rails.
export const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000; // never touch fresh uploads
export const ORPHAN_SCAN_EVERY_MS = 24 * 60 * 60 * 1000;
const MAX_DELETES_PER_RUN = 500;
const MAX_TRASH_PER_RUN = 200;

/** Every storage key the database still uses. */
export async function referencedKeys() {
  const lists = await Promise.all([
    Message.distinct('media.key'),
    Message.distinct('media.thumbnailKey'),
    Status.distinct('media.key'),
    Status.distinct('media.thumbnailKey'),
    User.distinct('avatar.key'),
    Song.distinct('audio.key'),
    Song.distinct('coverKey'),
    Conversation.distinct('wallpaper.imageKey'),
  ]);
  return new Set(lists.flat().filter(Boolean));
}

async function emptyTrash() {
  const items = await MediaTrash.find().sort({ updatedAt: 1 }).limit(MAX_TRASH_PER_RUN).lean();
  let cleared = 0;
  for (const item of items) {
    try {
      await storage.remove(item.key, item.resourceType);
      await MediaTrash.deleteOne({ _id: item._id });
      cleared += 1;
    } catch (err) {
      await MediaTrash.updateOne({ _id: item._id }, { $inc: { attempts: 1 }, $set: { lastError: String(err.message || '').slice(0, 200) } });
    }
  }
  return { trashRetried: items.length, trashCleared: cleared };
}

/** Deletes stored files that nothing references and that are over a day old. */
export async function deleteOrphans({ now = Date.now() } = {}) {
  if (typeof storage.list !== 'function') return { skipped: 'storage cannot list files' };
  const referenced = await referencedKeys();
  const orphans = [];
  let filesChecked = 0;
  for await (const file of storage.list()) {
    filesChecked += 1;
    if (!referenced.has(file.key) && now - file.createdAt.getTime() > ORPHAN_MIN_AGE_MS) orphans.push(file);
  }
  // Safety rail: an empty reference set with files present smells like a
  // database problem, not thousands of orphans. Do nothing.
  if (referenced.size === 0 && filesChecked > 0) return { filesChecked, skipped: 'no references found; refusing to delete' };

  let orphansDeleted = 0;
  let bytesFreed = 0;
  for (const file of orphans.slice(0, MAX_DELETES_PER_RUN)) {
    try {
      await storage.remove(file.key, file.resourceType);
      orphansDeleted += 1;
      bytesFreed += file.bytes;
    } catch {
      await MediaTrash.updateOne({ key: file.key }, { $set: { resourceType: file.resourceType }, $setOnInsert: { attempts: 0 } }, { upsert: true }).catch(() => {});
    }
  }
  return { filesChecked, orphansDeleted, bytesFreed };
}

let running = false;

/** One janitor pass. The orphan scan runs at most once a day (across restarts). */
export async function runJanitor({ forceOrphanScan = false } = {}) {
  if (running) return null;
  running = true;
  try {
    const result = { statusesRemoved: await sweepExpiredStatuses(), ...(await expireOldMedia()), ...(await emptyTrash()) };
    const lastScan = await JanitorRun.findOne({ orphanScan: true }).sort({ at: -1 }).lean();
    if (forceOrphanScan || !lastScan || Date.now() - lastScan.at.getTime() > ORPHAN_SCAN_EVERY_MS) {
      Object.assign(result, { orphanScan: true }, await deleteOrphans());
    }
    const busy = result.statusesRemoved || result.mediaExpired || result.trashCleared || result.orphansDeleted;
    if (busy || result.orphanScan) await JanitorRun.create(result);
    if (busy) {
      const mb = ((result.bytesFreed || 0) / 1024 / 1024).toFixed(1);
      const videoMb = ((result.mediaBytesFreed || 0) / 1024 / 1024).toFixed(1);
      logger.info(`Janitor: ${result.statusesRemoved} expired statuses, ${result.mediaExpired} old videos (${videoMb} MB), ${result.trashCleared} retried deletions, ${result.orphansDeleted || 0} orphan files (${mb} MB) removed`);
    }
    return result;
  } catch (err) {
    logger.warn('Janitor run failed', { message: err.message });
    return null;
  } finally {
    running = false;
  }
}
