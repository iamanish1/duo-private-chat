import fs from 'node:fs/promises';
import { fileTypeFromFile } from 'file-type';
import { config } from '../config/env.js';
import { badRequest, tooLarge } from '../utils/AppError.js';
import { storage, removeMedia } from './storage/index.js';

// Allow-list keyed by the type detected from the file's magic bytes. The
// client-declared MIME type and file name are never trusted.
const ALLOWED = {
  'image/jpeg': { resourceType: 'image', extension: 'jpg' },
  'image/png': { resourceType: 'image', extension: 'png' },
  'image/webp': { resourceType: 'image', extension: 'webp' },
  'image/gif': { resourceType: 'image', extension: 'gif' },
  'video/mp4': { resourceType: 'video', extension: 'mp4' },
  'video/x-m4v': { resourceType: 'video', extension: 'm4v' },
  'video/quicktime': { resourceType: 'video', extension: 'mov' },
  'video/webm': { resourceType: 'video', extension: 'webm' },
};

export const ACCEPTED_MIME_TYPES = Object.keys(ALLOWED);

// Voice notes come from MediaRecorder, whose containers are detected by their
// generic type (Chrome: WebM, Safari: MP4/M4A, Firefox: Ogg). Map each to the
// audio type it really is.
const VOICE_ALLOWED = {
  'video/webm': { mimeType: 'audio/webm', extension: 'webm' },
  'audio/webm': { mimeType: 'audio/webm', extension: 'webm' },
  'video/mp4': { mimeType: 'audio/mp4', extension: 'm4a' },
  'audio/mp4': { mimeType: 'audio/mp4', extension: 'm4a' },
  'audio/x-m4a': { mimeType: 'audio/mp4', extension: 'm4a' },
  'audio/ogg': { mimeType: 'audio/ogg', extension: 'ogg' },
  'audio/opus': { mimeType: 'audio/ogg', extension: 'ogg' },
  'application/ogg': { mimeType: 'audio/ogg', extension: 'ogg' },
  'audio/mpeg': { mimeType: 'audio/mpeg', extension: 'mp3' },
};

const megabytes = (bytes) => `${Math.round(bytes / 1024 / 1024)} MB`;

export async function inspectUpload(file) {
  const detected = await fileTypeFromFile(file.path);
  const kind = detected && ALLOWED[detected.mime];
  if (!kind) {
    throw badRequest('This file type is not supported. Send a JPG, PNG, WEBP or GIF image, or an MP4, MOV or WEBM video.', 'INVALID_FILE_TYPE');
  }
  const limit = kind.resourceType === 'image' ? config.media.maxImageBytes : config.media.maxVideoBytes;
  if (file.size > limit) {
    throw tooLarge(`${kind.resourceType === 'image' ? 'Images' : 'Videos'} can be up to ${megabytes(limit)}.`);
  }
  return { mimeType: detected.mime, ...kind };
}

/**
 * Validates and stores the main file plus an optional client-made thumbnail.
 * Returns the media metadata persisted on the message.
 */
export async function storeMessageMedia({ file, thumbnail, meta }) {
  const kind = await inspectUpload(file);
  if (kind.resourceType === 'video' && meta.duration && meta.duration > config.media.maxVideoSeconds) {
    throw badRequest(`Videos can be up to ${Math.floor(config.media.maxVideoSeconds / 60)} minutes long.`, 'VIDEO_TOO_LONG');
  }

  let thumbKind = null;
  if (thumbnail) {
    thumbKind = await inspectUpload(thumbnail);
    if (thumbKind.resourceType !== 'image' || thumbnail.size > 2 * 1024 * 1024) {
      throw badRequest('The video thumbnail is invalid.', 'INVALID_THUMBNAIL');
    }
  }

  const stored = await storage.upload({ filePath: file.path, ...kind });
  const media = {
    key: stored.key,
    resourceType: kind.resourceType,
    mimeType: kind.mimeType,
    size: stored.bytes ?? file.size,
    width: stored.width ?? meta.width,
    height: stored.height ?? meta.height,
    duration: stored.duration ?? meta.duration,
  };

  // Storage-reported duration is authoritative when available (Cloudinary).
  if (media.resourceType === 'video' && media.duration > config.media.maxVideoSeconds) {
    await removeMedia(media);
    throw badRequest(`Videos can be up to ${Math.floor(config.media.maxVideoSeconds / 60)} minutes long.`, 'VIDEO_TOO_LONG');
  }

  if (thumbnail) {
    try {
      const thumb = await storage.upload({ filePath: thumbnail.path, ...thumbKind });
      media.thumbnailKey = thumb.key;
    } catch {
      // A missing thumbnail only degrades the preview; keep the video.
    }
  }
  return media;
}

/** Validates and stores a recorded voice note (audio-only, short, small). */
export async function storeVoiceNote({ file, meta }) {
  const detected = await fileTypeFromFile(file.path);
  const kind = detected && VOICE_ALLOWED[detected.mime];
  if (!kind) throw badRequest('This voice note could not be read. Please record it again.', 'INVALID_FILE_TYPE');
  if (file.size > config.media.maxVoiceBytes) throw tooLarge(`Voice notes can be up to ${megabytes(config.media.maxVoiceBytes)}.`);
  const tooLong = (seconds) => seconds > config.media.maxVoiceSeconds + 1;
  const limitMessage = `Voice notes can be up to ${Math.floor(config.media.maxVoiceSeconds / 60)} minutes long.`;
  if (!meta.duration || tooLong(meta.duration)) throw badRequest(limitMessage, 'VOICE_TOO_LONG');

  const stored = await storage.upload({ filePath: file.path, resourceType: 'audio', ...kind });
  const media = {
    key: stored.key,
    resourceType: 'audio',
    mimeType: kind.mimeType,
    size: stored.bytes ?? file.size,
    duration: stored.duration ?? meta.duration,
    waveform: meta.waveform,
  };
  if (tooLong(media.duration)) {
    await removeMedia(media);
    throw badRequest(limitMessage, 'VOICE_TOO_LONG');
  }
  return media;
}

export async function storeAvatar(file) {
  const kind = await inspectUpload(file);
  if (kind.resourceType !== 'image') throw badRequest('Profile photos must be images.', 'INVALID_FILE_TYPE');
  const stored = await storage.upload({ filePath: file.path, ...kind });
  return { key: stored.key, resourceType: 'image' };
}

export async function discardTempFiles(...files) {
  await Promise.allSettled(files.filter(Boolean).map((file) => fs.rm(file.path, { force: true })));
}
