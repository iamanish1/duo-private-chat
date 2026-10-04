import { Conversation } from '../models/index.js';
import { badRequest } from '../utils/AppError.js';
import { storage, removeMedia } from './storage/index.js';
import { storeAvatar } from './mediaService.js';

// The chat background is shared: both people see it and either can change it.
// Presets are named by the client (colour / gradient ids); a photo lives in
// object storage. Read straight from the database — the session's
// conversation object is cached and would be stale.

export function serializeWallpaper(wallpaper) {
  if (!wallpaper?.kind || wallpaper.kind === 'default') {
    return { kind: 'default', value: null, dim: 0, imageUrl: null, updatedBy: wallpaper?.updatedBy ? String(wallpaper.updatedBy) : null, updatedAt: wallpaper?.updatedAt ?? null };
  }
  return {
    kind: wallpaper.kind,
    value: wallpaper.value ?? null,
    dim: wallpaper.dim ?? 0,
    imageUrl: wallpaper.imageKey ? storage.url(wallpaper.imageKey, { resourceType: 'image', variant: 'full' }) : null,
    updatedBy: wallpaper.updatedBy ? String(wallpaper.updatedBy) : null,
    updatedAt: wallpaper.updatedAt ?? null,
  };
}

const current = async (session) => (await Conversation.findById(session.conversation._id).select('wallpaper').lean())?.wallpaper ?? null;

export async function getWallpaper(session) {
  return serializeWallpaper(await current(session));
}

async function save(session, wallpaper, previous) {
  const doc = { ...wallpaper, updatedBy: session.user._id, updatedAt: new Date() };
  await Conversation.updateOne({ _id: session.conversation._id }, { $set: { wallpaper: doc } });
  // The old photo is no longer shown anywhere.
  if (previous?.imageKey && previous.imageKey !== doc.imageKey) removeMedia({ key: previous.imageKey, resourceType: 'image' });
  return serializeWallpaper(doc);
}

/** A colour or gradient preset, or back to the default; for a photo, just the dimming. */
export async function setWallpaper(session, { kind, value = null, dim = 0 }) {
  const previous = await current(session);
  if (kind === 'photo') {
    if (previous?.kind !== 'photo' || !previous.imageKey) throw badRequest('Choose a photo first.', 'NO_PHOTO');
    return save(session, { ...previous, dim }, previous);
  }
  if (kind !== 'default' && !value) throw badRequest('Choose a background.', 'VALIDATION_ERROR');
  return save(session, { kind, value: kind === 'default' ? null : value, dim, imageKey: null }, previous);
}

/** Your own photo as the background for both of you. */
export async function setPhotoWallpaper(session, file, dim = 0) {
  const previous = await current(session);
  const stored = await storeAvatar(file); // images only, checked by content
  try {
    return await save(session, { kind: 'photo', value: null, dim, imageKey: stored.key }, previous);
  } catch (err) {
    await removeMedia(stored);
    throw err;
  }
}
