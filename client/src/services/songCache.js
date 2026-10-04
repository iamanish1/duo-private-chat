// Keeps songs on this device after their first play, so replaying them uses
// no data (and no Cloudinary bandwidth). Same file, same quality.
import { resolveUrl } from '../utils/url';

const CACHE_NAME = 'duo-songs-v1';
const INDEX_KEY = 'duo-song-cache'; // { songId: { size, usedAt } } for least-recently-used eviction
const MAX_TOTAL_BYTES = 400 * 1024 * 1024;
const MAX_SONG_BYTES = 30 * 1024 * 1024; // bigger files just stream
const keyOf = (songId) => `/__duo-song/${songId}`;

const supported = () => typeof window !== 'undefined' && 'caches' in window;

function readIndex() {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY)) || {};
  } catch {
    return {};
  }
}

function writeIndex(index) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    // The index only steers eviction.
  }
}

const touch = (songId, size) => writeIndex({ ...readIndex(), [songId]: { size, usedAt: Date.now() } });

async function evictToFit(cache) {
  const index = readIndex();
  let total = Object.values(index).reduce((sum, e) => sum + (e.size || 0), 0);
  const oldestFirst = Object.entries(index).sort((a, b) => a[1].usedAt - b[1].usedAt);
  for (const [songId, entry] of oldestFirst) {
    if (total <= MAX_TOTAL_BYTES) break;
    await cache.delete(keyOf(songId));
    delete index[songId];
    total -= entry.size || 0;
  }
  writeIndex(index);
}

const network = (song) => ({ url: resolveUrl(song.url), cached: false, revoke: () => {} });
const fromBlob = (blob) => {
  const url = URL.createObjectURL(blob);
  return { url, cached: true, revoke: () => URL.revokeObjectURL(url) };
};

/**
 * Where to play a song from: this device if it's saved, otherwise download
 * it once (saving it) — the same bytes streaming would fetch anyway. Falls
 * back to plain streaming for big files or if anything goes wrong.
 */
export async function songSource(song) {
  if (!supported()) return network(song);
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(keyOf(song.id));
    if (hit) {
      const blob = await hit.blob();
      touch(song.id, blob.size);
      return fromBlob(blob);
    }
    if (song.size && song.size > MAX_SONG_BYTES) return network(song);
    const url = resolveUrl(song.url);
    const res = await fetch(url, { credentials: url.startsWith('http') && !url.startsWith(window.location.origin) ? 'omit' : 'include' });
    if (!res.ok) return network(song);
    const blob = await res.blob();
    await cache.put(keyOf(song.id), new Response(blob, { headers: { 'Content-Type': song.mimeType || blob.type } }));
    touch(song.id, blob.size);
    await evictToFit(cache);
    return fromBlob(blob);
  } catch {
    return network(song);
  }
}

export async function forgetSong(songId) {
  if (!supported()) return;
  const index = readIndex();
  delete index[songId];
  writeIndex(index);
  await caches
    .open(CACHE_NAME)
    .then((cache) => cache.delete(keyOf(songId)))
    .catch(() => {});
}

/** On sign-out: nothing of the shared library stays on the device. */
export async function clearSongCache() {
  writeIndex({});
  if (supported()) await caches.delete(CACHE_NAME).catch(() => {});
}
