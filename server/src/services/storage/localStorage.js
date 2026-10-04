import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const LOCAL_KEY_PATTERN = /^[a-f\d]{32}\.[a-z\d]{2,5}$/;

/**
 * Development/test driver: files go to a private directory on disk and are
 * served only through the authenticated GET /api/media/file/:key route.
 * Not for production — use Cloudinary (or another object store) there.
 */
export function createLocalStorage({ directory }) {
  const ready = fs.mkdir(directory, { recursive: true });
  const resolveKey = (key) => {
    if (!LOCAL_KEY_PATTERN.test(key)) throw new Error('Invalid storage key');
    return path.join(directory, key);
  };

  return {
    name: 'local',
    directory,

    async upload({ filePath, extension }) {
      await ready;
      const key = `${crypto.randomBytes(16).toString('hex')}.${extension}`;
      await fs.copyFile(filePath, resolveKey(key));
      const { size } = await fs.stat(resolveKey(key));
      return { key, bytes: size };
    },

    url(key) {
      return `/api/media/file/${key}`;
    },

    videoPosterUrl() {
      return null;
    },

    resolvePath: resolveKey,

    async remove(key) {
      await fs.rm(resolveKey(key), { force: true });
    },

    /** Every stored file: { key, resourceType, bytes, createdAt }. */
    async *list() {
      await ready;
      for (const name of await fs.readdir(directory)) {
        if (!LOCAL_KEY_PATTERN.test(name)) continue;
        const info = await fs.stat(path.join(directory, name));
        yield { key: name, resourceType: 'image', bytes: info.size, createdAt: info.mtime };
      }
    },
  };
}
