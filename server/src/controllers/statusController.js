import { badRequest } from '../utils/AppError.js';
import { parseOrThrow } from '../middleware/validate.js';
import { uploadedFile } from '../middleware/upload.js';
import { statusUploadBody } from '../validators/schemas.js';
import { discardTempFiles, storeMessageMedia } from '../services/mediaService.js';
import * as statuses from '../services/statusService.js';
import { serializeStatus } from '../services/serializers.js';
import { emitToConversation } from '../sockets/realtime.js';
import { removeMedia } from '../services/storage/index.js';

// Both people's devices hear about every change, so rings and "seen" update live.
const publish = (req, event, payload) => emitToConversation(req.session.conversation._id, event, payload);

export async function list(req, res) {
  const docs = await statuses.listStatuses(req.session);
  res.json({ statuses: docs.map(serializeStatus) });
}

export async function createText(req, res) {
  const status = serializeStatus(await statuses.createStatus(req.session, { type: 'text', ...req.valid.body }));
  publish(req, 'status:new', status);
  res.status(201).json({ status });
}

export async function createMedia(req, res) {
  const file = uploadedFile(req, 'file');
  const thumbnail = uploadedFile(req, 'thumbnail');
  try {
    if (!file) throw badRequest('Choose a photo or video for your status.', 'FILE_REQUIRED');
    const body = parseOrThrow(statusUploadBody, req.body);
    const media = await storeMessageMedia({ file, thumbnail, meta: body, maxVideoSeconds: statuses.STATUS_VIDEO_MAX_SECONDS });
    let doc;
    try {
      doc = await statuses.createStatus(req.session, { type: media.resourceType, text: body.text, media });
    } catch (err) {
      await removeMedia(media);
      throw err;
    }
    const status = serializeStatus(doc);
    publish(req, 'status:new', status);
    res.status(201).json({ status });
  } finally {
    await discardTempFiles(file, thumbnail);
  }
}

export async function view(req, res) {
  const { status, changed } = await statuses.markStatusViewed(req.session, req.valid.params.id);
  if (changed) publish(req, 'status:viewed', { id: String(status._id), viewedAt: status.viewedAt });
  res.json({ status: serializeStatus(status) });
}

export async function remove(req, res) {
  const status = await statuses.deleteStatus(req.session, req.valid.params.id);
  publish(req, 'status:deleted', { id: String(status._id) });
  res.status(204).end();
}
