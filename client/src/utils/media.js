import { ACCEPTED_IMAGE_TYPES, ACCEPTED_VIDEO_TYPES, LIMITS } from '../config';
import { formatBytes } from './format';

const EXTENSION_KIND = {
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', gif: 'image', heic: 'image', heif: 'image',
  mp4: 'video', m4v: 'video', mov: 'video', webm: 'video',
};
// Decodable by some browsers (Safari) and re-encoded to JPEG before upload.
const CONVERTIBLE_IMAGES = ['image/heic', 'image/heif'];

export function classifyFile(file) {
  if (ACCEPTED_IMAGE_TYPES.includes(file.type) || CONVERTIBLE_IMAGES.includes(file.type)) return 'image';
  if (ACCEPTED_VIDEO_TYPES.includes(file.type)) return 'video';
  // Some Android pickers report an empty MIME type.
  if (!file.type) return EXTENSION_KIND[file.name.split('.').pop()?.toLowerCase()] ?? null;
  return null;
}

/** Client-side pre-check; the server re-validates by file contents. */
export function validateMediaFile(file) {
  const kind = classifyFile(file);
  if (!kind) return { ok: false, error: `“${file.name}” isn't a supported photo or video.` };
  const limit = kind === 'image' ? LIMITS.imageBytes : LIMITS.videoBytes;
  if (file.size > limit) {
    return { ok: false, kind, error: `${kind === 'image' ? 'Photos' : 'Videos'} can be up to ${formatBytes(limit)} (this one is ${formatBytes(file.size)}).` };
  }
  return { ok: true, kind };
}

async function decodeImage(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Fall through to <img>, which handles more formats on Safari.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const canvasToBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Downscales and re-encodes photos for mobile networks. GIFs are left alone
 * (animation), and the original is kept if re-encoding would not help.
 */
export async function compressImage(file, { maxDimension = 2048, quality = 0.82 } = {}) {
  let source;
  try {
    source = await decodeImage(file);
  } catch {
    throw new Error("This photo format can't be opened on this device. Try a JPG or PNG.");
  }
  const width = source.width;
  const height = source.height;
  const needsConversion = CONVERTIBLE_IMAGES.includes(file.type) || !file.type;
  if (file.type === 'image/gif' || (!needsConversion && file.size < 350 * 1024 && Math.max(width, height) <= maxDimension)) {
    source.close?.();
    return { file, width, height };
  }

  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();

  let blob = await canvasToBlob(canvas, 'image/webp', quality);
  // Older Safari silently falls back to PNG for unsupported encoders.
  if (!blob || blob.type !== 'image/webp') blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  if (!blob || (!needsConversion && blob.size >= file.size)) return { file, width, height };

  const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const name = `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.${extension}`;
  return { file: new File([blob], name, { type: blob.type }), width: canvas.width, height: canvas.height };
}

/** Reads duration/dimensions and grabs a poster frame for the bubble. */
export function readVideoMeta(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const meta = { duration: null, width: null, height: null, thumbnail: null };
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    const timer = setTimeout(finish, 8000);

    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      meta.duration = Number.isFinite(video.duration) ? video.duration : null;
      meta.width = video.videoWidth || null;
      meta.height = video.videoHeight || null;
      video.currentTime = Math.min(0.5, (video.duration || 1) / 3);
    };
    video.onseeked = async () => {
      try {
        const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        meta.thumbnail = await canvasToBlob(canvas, 'image/jpeg', 0.75);
      } catch {
        // Poster is optional.
      }
      finish();
    };
    video.onerror = finish;
    video.src = url;
  });
}

/** Prepares a picked file for upload (compression, metadata, limits). */
export async function prepareMedia(file) {
  const check = validateMediaFile(file);
  if (!check.ok) throw new Error(check.error);
  if (check.kind === 'image') {
    const result = await compressImage(file);
    return { kind: 'image', ...result, thumbnail: null, duration: null };
  }
  const meta = await readVideoMeta(file);
  if (meta.duration && meta.duration > LIMITS.videoSeconds) {
    throw new Error(`Videos can be up to ${Math.floor(LIMITS.videoSeconds / 60)} minutes long.`);
  }
  return { kind: 'video', file, ...meta };
}
