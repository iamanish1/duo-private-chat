import os from 'node:os';
import crypto from 'node:crypto';
import multer from 'multer';
import { config } from '../config/env.js';
import { badRequest, tooLarge } from '../utils/AppError.js';

// Uploads stream to a temp dir (never memory-buffered, never MongoDB), are
// validated by magic bytes in mediaService, then pushed to object storage.
const storage = multer.diskStorage({
  destination: os.tmpdir(),
  filename: (req, file, cb) => cb(null, `duo-${crypto.randomBytes(12).toString('hex')}`),
});

function createUploader(maxBytes, fields) {
  const upload = multer({
    storage,
    limits: { fileSize: maxBytes, files: fields.length, fields: 10, fieldSize: 8 * 1024 },
    fileFilter: (req, file, cb) => {
      // Cheap early rejection; the authoritative check is on file contents.
      if (/^(image|video|audio)\//.test(file.mimetype)) cb(null, true);
      else cb(badRequest('Only photos, videos and voice notes can be sent.', 'INVALID_FILE_TYPE'));
    },
  }).fields(fields.map((name) => ({ name, maxCount: 1 })));

  return (req, res, next) =>
    upload(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return next(tooLarge(`Files can be up to ${Math.round(maxBytes / 1024 / 1024)} MB.`));
      if (err instanceof multer.MulterError) return next(badRequest('The upload could not be processed.', 'UPLOAD_INVALID'));
      next(err);
    });
}

export const messageUpload = createUploader(Math.max(config.media.maxImageBytes, config.media.maxVideoBytes), ['file', 'thumbnail']);
export const avatarUpload = createUploader(config.media.maxImageBytes, ['file']);

export const uploadedFile = (req, name) => req.files?.[name]?.[0];
