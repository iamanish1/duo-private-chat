import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { createCloudinaryStorage } from './cloudinaryStorage.js';
import { createLocalStorage } from './localStorage.js';

function createStorage() {
  if (config.storage.driver === 'cloudinary') return createCloudinaryStorage(config.storage.cloudinary);
  if (config.isProd) logger.warn('Using local disk media storage in production; configure Cloudinary instead.');
  return createLocalStorage({ directory: config.storage.localDir });
}

export const storage = createStorage();

/** Best-effort deletion; a storage hiccup must not fail the user's request. */
export async function removeMedia(media) {
  if (!media) return;
  const jobs = [storage.remove(media.key, media.resourceType)];
  if (media.thumbnailKey) jobs.push(storage.remove(media.thumbnailKey, 'image'));
  const results = await Promise.allSettled(jobs);
  if (results.some((r) => r.status === 'rejected')) logger.warn('Failed to delete a media asset from storage');
}
