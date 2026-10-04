import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileTypeFromFile } from 'file-type';
import { parseFile } from 'music-metadata';
import { Playlist, Song } from '../models/index.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { toObjectId } from '../utils/ids.js';
import { storage, removeMedia } from './storage/index.js';

// Detected (magic-byte) type → what we store and serve. Every format here
// plays natively in current browsers, so songs are never transcoded.
const SONG_TYPES = {
  'audio/mpeg': { mimeType: 'audio/mpeg', extension: 'mp3' },
  'audio/mp4': { mimeType: 'audio/mp4', extension: 'm4a' },
  'audio/x-m4a': { mimeType: 'audio/mp4', extension: 'm4a' },
  'video/mp4': { mimeType: 'audio/mp4', extension: 'm4a' },
  'audio/aac': { mimeType: 'audio/aac', extension: 'aac' },
  'audio/ogg': { mimeType: 'audio/ogg', extension: 'ogg' },
  'audio/opus': { mimeType: 'audio/ogg', extension: 'ogg' },
  'audio/x-flac': { mimeType: 'audio/flac', extension: 'flac' },
  'audio/flac': { mimeType: 'audio/flac', extension: 'flac' },
  'audio/wav': { mimeType: 'audio/wav', extension: 'wav' },
  'audio/vnd.wave': { mimeType: 'audio/wav', extension: 'wav' },
  'audio/x-wav': { mimeType: 'audio/wav', extension: 'wav' },
};
const EXTENSION_OF = Object.fromEntries(Object.values(SONG_TYPES).map((t) => [t.mimeType, t.extension]));
const COVER_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_SONG_SECONDS = 2 * 60 * 60;
const MAX_SONGS = 3000;
const MAX_PLAYLISTS = 100;
const MAX_PLAYLIST_SONGS = 1000;

// Multer decodes multipart file names as latin1; recover UTF-8 (Hindi, emoji…).
const decodeName = (name = '') => {
  try {
    return Buffer.from(name, 'latin1').toString('utf8');
  } catch {
    return name;
  }
};

/** "03 - Kesariya_(Official).mp3" → "Kesariya (Official)" */
export function titleFromFileName(name) {
  const base = path.parse(decodeName(name)).name.replace(/_/g, ' ').replace(/^\s*\d{1,3}\s*[-.)]\s*/, '').replace(/\s+/g, ' ').trim();
  return (base || 'Untitled song').slice(0, 200);
}

async function storeCover(picture) {
  const extension = picture && COVER_TYPES[picture.format?.toLowerCase()];
  if (!extension || !picture.data?.length || picture.data.length > 5 * 1024 * 1024) return null;
  const tmp = path.join(os.tmpdir(), `duo-cover-${crypto.randomBytes(8).toString('hex')}.${extension}`);
  try {
    await fs.writeFile(tmp, picture.data);
    const detected = await fileTypeFromFile(tmp);
    if (!detected || !COVER_TYPES[detected.mime]) return null;
    const stored = await storage.upload({ filePath: tmp, resourceType: 'image', mimeType: detected.mime, extension: COVER_TYPES[detected.mime], subfolder: 'music/covers' });
    return stored.key;
  } catch {
    return null; // a song without art is fine
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

/** Validates an uploaded song, reads its tags/cover, stores it, adds it to the library. */
export async function addSong(session, file) {
  const detected = await fileTypeFromFile(file.path);
  const kind = detected && SONG_TYPES[detected.mime];
  if (!kind) throw badRequest("That file isn't a song Duo can play. Use MP3, M4A, AAC, FLAC, WAV or OGG.", 'INVALID_FILE_TYPE');
  if ((await Song.countDocuments({ conversationId: session.conversation._id })) >= MAX_SONGS) {
    throw badRequest(`Your library is full (${MAX_SONGS} songs). Delete some first.`, 'LIBRARY_FULL');
  }

  const meta = await parseFile(file.path, { duration: true }).catch(() => null);
  const duration = meta?.format?.duration;
  if (!duration || !Number.isFinite(duration)) throw badRequest("This song couldn't be read. Try exporting it again as MP3.", 'UNREADABLE_AUDIO');
  if (duration > MAX_SONG_SECONDS) throw badRequest('Songs can be up to 2 hours long.', 'SONG_TOO_LONG');

  const common = meta.common || {};
  const stored = await storage.upload({ filePath: file.path, resourceType: 'audio', ...kind, subfolder: 'music' });
  const audio = { key: stored.key, resourceType: 'audio', mimeType: kind.mimeType, size: stored.bytes ?? file.size, duration: stored.duration ?? duration };
  const coverKey = await storeCover(common.picture?.[0]);
  try {
    const song = await Song.create({
      conversationId: session.conversation._id,
      uploadedBy: session.user._id,
      title: (common.title || titleFromFileName(file.originalname)).trim().slice(0, 200),
      artist: (common.artist || common.albumartist || '').trim().slice(0, 200),
      album: (common.album || '').trim().slice(0, 200),
      audio,
      coverKey,
    });
    return song.toObject();
  } catch (err) {
    await removeMedia(audio);
    if (coverKey) await removeMedia({ key: coverKey, resourceType: 'image' });
    throw err;
  }
}

export function serializeSong(song) {
  return {
    id: String(song._id),
    title: song.title,
    artist: song.artist || '',
    album: song.album || '',
    duration: song.audio.duration,
    size: song.audio.size,
    mimeType: song.audio.mimeType,
    url: storage.url(song.audio.key, { resourceType: 'audio', format: EXTENSION_OF[song.audio.mimeType], mimeType: song.audio.mimeType }),
    coverUrl: song.coverKey ? storage.url(song.coverKey, { resourceType: 'image', variant: 'thumb' }) : null,
    uploadedBy: String(song.uploadedBy),
    createdAt: song.createdAt,
  };
}

export function serializePlaylist(playlist) {
  return {
    id: String(playlist._id),
    name: playlist.name,
    songIds: playlist.songIds.map(String),
    createdBy: String(playlist.createdBy),
    createdAt: playlist.createdAt,
    updatedAt: playlist.updatedAt,
  };
}

const scope = (session) => ({ conversationId: session.conversation._id });

export async function listLibrary(session) {
  const [songs, playlists] = await Promise.all([
    Song.find(scope(session)).sort({ createdAt: -1 }).lean(),
    Playlist.find(scope(session)).sort({ createdAt: 1 }).lean(),
  ]);
  return { songs, playlists };
}

export async function findSong(session, songId) {
  const song = await Song.findOne({ ...scope(session), _id: toObjectId(songId) }).lean();
  if (!song) throw notFound('That song is no longer in your library.', 'SONG_NOT_FOUND');
  return song;
}

/** Song ids that belong to this conversation, in the order given. */
export async function existingSongIds(session, ids) {
  const found = await Song.find({ ...scope(session), _id: { $in: ids.map(toObjectId) } }).select('_id').lean();
  const ok = new Set(found.map((s) => String(s._id)));
  return ids.filter((id) => ok.has(id));
}

export async function updateSong(session, songId, { title, artist }) {
  const set = {};
  if (title !== undefined) set.title = title.trim() || 'Untitled song';
  if (artist !== undefined) set.artist = artist.trim();
  const song = await Song.findOneAndUpdate({ ...scope(session), _id: toObjectId(songId) }, { $set: set }, { returnDocument: 'after' }).lean();
  if (!song) throw notFound('That song is no longer in your library.', 'SONG_NOT_FOUND');
  return song;
}

/** Removes a song everywhere: library, playlists, storage. Returns the playlists that changed. */
export async function deleteSong(session, songId) {
  const song = await findSong(session, songId);
  await Song.deleteOne({ _id: song._id });
  const affected = await Playlist.find({ ...scope(session), songIds: song._id }).select('_id').lean();
  await Playlist.updateMany({ ...scope(session), songIds: song._id }, { $pull: { songIds: song._id } });
  removeMedia(song.audio);
  if (song.coverKey) removeMedia({ key: song.coverKey, resourceType: 'image' });
  return Playlist.find({ _id: { $in: affected.map((p) => p._id) } }).lean();
}

async function findPlaylist(session, playlistId) {
  const playlist = await Playlist.findOne({ ...scope(session), _id: toObjectId(playlistId) }).lean();
  if (!playlist) throw notFound('That playlist was deleted.', 'PLAYLIST_NOT_FOUND');
  return playlist;
}

export async function createPlaylist(session, { name }) {
  if ((await Playlist.countDocuments(scope(session))) >= MAX_PLAYLISTS) throw badRequest(`You can have up to ${MAX_PLAYLISTS} playlists.`, 'TOO_MANY_PLAYLISTS');
  const playlist = await Playlist.create({ ...scope(session), createdBy: session.user._id, name: name.trim() });
  return playlist.toObject();
}

export async function renamePlaylist(session, playlistId, { name }) {
  await findPlaylist(session, playlistId);
  return Playlist.findByIdAndUpdate(playlistId, { $set: { name: name.trim() } }, { returnDocument: 'after' }).lean();
}

export async function deletePlaylist(session, playlistId) {
  const playlist = await findPlaylist(session, playlistId);
  await Playlist.deleteOne({ _id: playlist._id });
  return playlist;
}

/** Adds a song at the end (no duplicates). Safe when both people add at once. */
export async function addToPlaylist(session, playlistId, songId) {
  const playlist = await findPlaylist(session, playlistId);
  const song = await findSong(session, songId);
  if (playlist.songIds.length >= MAX_PLAYLIST_SONGS) throw badRequest(`Playlists can hold up to ${MAX_PLAYLIST_SONGS} songs.`, 'PLAYLIST_FULL');
  return Playlist.findByIdAndUpdate(playlist._id, { $addToSet: { songIds: song._id } }, { returnDocument: 'after' }).lean();
}

export async function removeFromPlaylist(session, playlistId, songId) {
  const playlist = await findPlaylist(session, playlistId);
  return Playlist.findByIdAndUpdate(playlist._id, { $pull: { songIds: toObjectId(songId) } }, { returnDocument: 'after' }).lean();
}

/** New order: must contain exactly the playlist's current songs. */
export async function reorderPlaylist(session, playlistId, songIds) {
  const playlist = await findPlaylist(session, playlistId);
  const current = playlist.songIds.map(String);
  const same = songIds.length === current.length && new Set(songIds).size === songIds.length && songIds.every((id) => current.includes(id));
  if (!same) throw badRequest('The playlist changed meanwhile. Try again.', 'PLAYLIST_CHANGED');
  return Playlist.findByIdAndUpdate(playlist._id, { $set: { songIds: songIds.map(toObjectId) } }, { returnDocument: 'after' }).lean();
}
