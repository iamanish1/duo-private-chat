import { Sticker } from '../models/index.js';
import { config } from '../config/env.js';
import { badRequest, notFound, AppError } from '../utils/AppError.js';
import { toObjectId } from '../utils/ids.js';
import { storage, removeMedia } from './storage/index.js';
import { storeAvatar } from './mediaService.js';
import { logger } from '../utils/logger.js';

const MAX_TRAY = 200;

// ---- Your own stickers (shared tray) -------------------------------------------------
export function serializeSticker(sticker) {
  return {
    id: String(sticker._id),
    url: storage.url(sticker.key, { resourceType: 'image', variant: 'thumb' }),
    width: sticker.width,
    height: sticker.height,
    createdBy: String(sticker.createdBy),
    createdAt: sticker.createdAt,
  };
}

const scope = (session) => ({ conversationId: session.conversation._id });

export function listStickers(session) {
  return Sticker.find(scope(session)).sort({ createdAt: -1 }).limit(MAX_TRAY).lean();
}

/** Saves a sticker made on the phone (the client draws the 512×512 image). */
export async function addSticker(session, file) {
  if ((await Sticker.countDocuments(scope(session))) >= MAX_TRAY) throw badRequest(`Your sticker tray is full (${MAX_TRAY}). Delete some first.`, 'TRAY_FULL');
  if (file.size > 1024 * 1024) throw badRequest('That sticker is too big.', 'STICKER_TOO_BIG');
  const stored = await storeAvatar(file); // images only, checked by content
  try {
    const sticker = await Sticker.create({ ...scope(session), createdBy: session.user._id, key: stored.key });
    return sticker.toObject();
  } catch (err) {
    await removeMedia(stored);
    throw err;
  }
}

/**
 * Removes a sticker from the tray. Messages that already used it keep
 * showing it (the storage janitor only deletes files nothing refers to).
 */
export async function removeSticker(session, stickerId) {
  const sticker = await Sticker.findOneAndDelete({ ...scope(session), _id: toObjectId(stickerId) }).lean();
  if (!sticker) throw notFound('That sticker was already removed.', 'STICKER_NOT_FOUND');
  return sticker;
}

export async function findSticker(session, stickerId) {
  const sticker = await Sticker.findOne({ ...scope(session), _id: toObjectId(stickerId) }).lean();
  if (!sticker) throw badRequest('That sticker was removed from your tray.', 'STICKER_NOT_FOUND');
  return sticker;
}

// ---- GIF search (GIPHY), through the server so the key stays private --------------------
// Tests swap in a key (the real config is frozen).
let giphyKeyOverride;
export function setGiphyApiKey(key) {
  giphyKeyOverride = key;
  gifCache.clear();
}
const giphyKey = () => (giphyKeyOverride === undefined ? config.giphyApiKey : giphyKeyOverride);

const GIF_TTL_MS = 10 * 60 * 1000;
const gifCache = new Map(); // "q|offset" -> { at, data }
export const GIF_URL = /^https:\/\/media\d*\.giphy\.com\/media\/[\w/.-]+\.(webp|gif)(\?[\w=&.-]*)?$/;

const trim = (gif) => {
  const img = gif.images?.fixed_width;
  if (!img?.webp && !img?.url) return null;
  const url = img.webp || img.url;
  if (!GIF_URL.test(url)) return null;
  return { id: gif.id, title: String(gif.title || '').slice(0, 140), url, width: Number(img.width) || 200, height: Number(img.height) || 200 };
};

export async function searchGifs({ q = '', offset = 0 }) {
  if (!giphyKey()) throw new AppError(503, 'GIFS_NOT_CONFIGURED', 'GIF search isn’t set up yet.');
  const query = q.trim().toLowerCase();
  const cacheKey = `${query}|${offset}`;
  const hit = gifCache.get(cacheKey);
  if (hit && Date.now() - hit.at < GIF_TTL_MS) return hit.data;

  const params = new URLSearchParams({ api_key: giphyKey(), limit: '24', offset: String(offset), rating: 'pg-13', bundle: 'messaging_non_clips' });
  if (query) params.set('q', query);
  const url = `https://api.giphy.com/v1/gifs/${query ? 'search' : 'trending'}?${params}`;
  let body;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`GIPHY responded ${res.status}`);
    body = await res.json();
  } catch (err) {
    logger.warn('GIF search failed', { message: err.message });
    throw new AppError(502, 'GIFS_UNAVAILABLE', 'GIFs couldn’t be loaded right now. Try again in a moment.');
  }
  const data = { gifs: (body.data || []).map(trim).filter(Boolean), nextOffset: offset + (body.pagination?.count ?? 0), hasMore: (body.pagination?.offset ?? 0) + (body.pagination?.count ?? 0) < (body.pagination?.total_count ?? 0) };
  gifCache.set(cacheKey, { at: Date.now(), data });
  if (gifCache.size > 200) gifCache.delete(gifCache.keys().next().value);
  return data;
}
