import fs from 'node:fs';
import { badRequest, notFound } from '../utils/AppError.js';
import { parseOrThrow } from '../middleware/validate.js';
import { uploadedFile } from '../middleware/upload.js';
import { uploadBody } from '../validators/schemas.js';
import { discardTempFiles, storeMessageMedia, storeVoiceNote } from '../services/mediaService.js';
import { createMessage, findByClientId } from '../services/messageService.js';
import { publishNewMessage } from '../services/messageEvents.js';
import { serializeMessage } from '../services/serializers.js';
import { storage, removeMedia } from '../services/storage/index.js';
import { LOCAL_KEY_PATTERN } from '../services/storage/localStorage.js';

/**
 * Client → auth → validate (magic bytes, size, duration) → object storage →
 * MongoDB message (URL metadata only) → Socket.IO fan-out → recipient.
 */
export async function uploadMessageMedia(req, res) {
  const file = uploadedFile(req, 'file');
  const thumbnail = uploadedFile(req, 'thumbnail');
  try {
    if (!file) throw badRequest('Choose a photo, video or voice note to send.', 'FILE_REQUIRED');
    const body = parseOrThrow(uploadBody, req.body);

    if (body.clientId) {
      const existing = await findByClientId(req.session, body.clientId);
      if (existing) return res.json({ message: serializeMessage(existing) });
    }

    const voice = body.kind === 'voice';
    const media = voice ? await storeVoiceNote({ file, meta: body }) : await storeMessageMedia({ file, thumbnail, meta: body });
    let result;
    try {
      result = await createMessage(req.session, {
        type: media.resourceType,
        text: voice ? '' : body.text,
        media,
        clientId: body.clientId,
        replyTo: body.replyTo,
      });
    } catch (err) {
      await removeMedia(media);
      throw err;
    }
    if (result.duplicate) {
      await removeMedia(media);
      return res.json({ message: serializeMessage(result.message) });
    }
    res.status(201).json({ message: publishNewMessage(req.session, result.message) });
  } finally {
    await discardTempFiles(file, thumbnail);
  }
}

/** Local-driver delivery: authenticated, range-capable, never public. */
export function serveLocalFile(req, res, next) {
  const { key } = req.params;
  if (storage.name !== 'local' || !LOCAL_KEY_PATTERN.test(key)) return next(notFound());
  const filePath = storage.resolvePath(key);
  if (!fs.existsSync(filePath)) return next(notFound('This file is no longer available.', 'MEDIA_NOT_FOUND'));
  res.sendFile(filePath, { headers: { 'Cache-Control': 'private, max-age=31536000, immutable' } });
}
