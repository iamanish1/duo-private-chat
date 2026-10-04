import { User } from '../models/index.js';
import { badRequest } from '../utils/AppError.js';
import { parseOrThrow } from '../middleware/validate.js';
import { uploadedFile } from '../middleware/upload.js';
import { wallpaperBody } from '../validators/schemas.js';
import { discardTempFiles } from '../services/mediaService.js';
import { publicUser, selfUser } from '../services/serializers.js';
import * as wallpapers from '../services/wallpaperService.js';
import { emitToConversation, isUserOnline } from '../sockets/realtime.js';

export async function getConversation(req, res) {
  const { user, conversation, peerId } = req.session;
  const peer = await User.findById(peerId).lean();
  // Presence comes from live sockets, not the DB flag, so it is never stale.
  const online = await isUserOnline(peerId);
  res.json({
    conversation: { id: String(conversation._id), createdAt: conversation.createdAt, wallpaper: await wallpapers.getWallpaper(req.session) },
    me: selfUser(user),
    peer: publicUser(peer, { isOnline: online }),
  });
}

// Both phones switch background at once; the other person sees who changed it.
const publishWallpaper = (req, wallpaper) =>
  emitToConversation(req.session.conversation._id, 'conversation:wallpaper', { wallpaper, by: String(req.session.user._id) });

export async function setWallpaper(req, res) {
  const wallpaper = await wallpapers.setWallpaper(req.session, req.valid.body);
  publishWallpaper(req, wallpaper);
  res.json({ wallpaper });
}

export async function uploadWallpaper(req, res) {
  const file = uploadedFile(req, 'file');
  try {
    if (!file) throw badRequest('Choose a photo.', 'FILE_REQUIRED');
    const { dim } = parseOrThrow(wallpaperBody.pick({ dim: true }), { dim: req.body?.dim === undefined ? undefined : Number(req.body.dim) });
    const wallpaper = await wallpapers.setPhotoWallpaper(req.session, file, dim);
    publishWallpaper(req, wallpaper);
    res.status(201).json({ wallpaper });
  } finally {
    await discardTempFiles(file);
  }
}
