import { badRequest } from '../utils/AppError.js';
import { uploadedFile } from '../middleware/upload.js';
import { discardTempFiles } from '../services/mediaService.js';
import * as stickers from '../services/stickerService.js';
import { emitToConversation } from '../sockets/realtime.js';

// The tray is shared, so both phones hear about new and removed stickers.
const publish = (req, event, payload) => emitToConversation(req.session.conversation._id, event, payload);

export async function list(req, res) {
  res.json({ stickers: (await stickers.listStickers(req.session)).map(stickers.serializeSticker) });
}

export async function create(req, res) {
  const file = uploadedFile(req, 'file');
  try {
    if (!file) throw badRequest('Choose a picture for the sticker.', 'FILE_REQUIRED');
    const sticker = stickers.serializeSticker(await stickers.addSticker(req.session, file));
    publish(req, 'sticker:added', sticker);
    res.status(201).json({ sticker });
  } finally {
    await discardTempFiles(file);
  }
}

export async function remove(req, res) {
  await stickers.removeSticker(req.session, req.valid.params.id);
  publish(req, 'sticker:removed', { id: req.valid.params.id });
  res.status(204).end();
}

export async function gifs(req, res) {
  res.set('Cache-Control', 'private, max-age=300');
  res.json(await stickers.searchGifs(req.valid.query));
}
