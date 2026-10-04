import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { MediaTrash } from '../../models/MediaTrash.js';
import { createCloudinaryStorage } from './cloudinaryStorage.js';
import { createLocalStorage } from './localStorage.js';

function createStorage() {
  if (config.storage.driver === 'cloudinary') return createCloudinaryStorage(config.storage.cloudinary);
  if (config.isProd) logger.warn('Using local disk media storage in production; configure Cloudinary instead.');
  return createLocalStorage({ directory: config.storage.localDir });
}

export const storage = createStorage();

/**
 * Best-effort deletion; a storage hiccup must not fail the user's request.
 * Anything that couldn't be deleted goes on the trash list for the janitor
 * to retry, so files are never left behind for good.
 */
export async function removeMedia(media) {
  if (!media?.key) return;
  const files = [{ key: media.key, resourceType: media.resourceType || 'image' }];
  if (media.thumbnailKey) files.push({ key: media.thumbnailKey, resourceType: 'image' });
  const results = await Promise.allSettled(files.map((f) => storage.remove(f.key, f.resourceType)));
  const failed = files.map((f, i) => ({ ...f, error: results[i].reason })).filter((f, i) => results[i].status === 'rejected');
  if (!failed.length) return;
  logger.warn('Failed to delete a media asset from storage; will retry');
  await Promise.allSettled(
    failed.map((f) =>
      MediaTrash.updateOne(
        { key: f.key },
        { $set: { resourceType: f.resourceType, lastError: String(f.error?.message || '').slice(0, 200) }, $setOnInsert: { attempts: 0 } },
        { upsert: true },
      ),
    ),
  );
}
