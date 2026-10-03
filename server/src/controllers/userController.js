import { User } from '../models/index.js';
import { badRequest } from '../utils/AppError.js';
import { uploadedFile } from '../middleware/upload.js';
import { discardTempFiles, storeAvatar } from '../services/mediaService.js';
import { publicUser, selfUser } from '../services/serializers.js';
import { removeMedia } from '../services/storage/index.js';
import { emitToConversation } from '../sockets/realtime.js';

function broadcastProfile(req, user) {
  emitToConversation(req.session.conversation._id, 'user:updated', publicUser(user));
}

export async function updateProfile(req, res) {
  const { name, settings } = req.valid.body;
  const update = {};
  if (name) update.name = name;
  if (settings?.notificationPreview) update['settings.notificationPreview'] = settings.notificationPreview;
  const callSettingChanged = ['allowVoiceCalls', 'allowVideoCalls'].filter((key) => typeof settings?.[key] === 'boolean');
  for (const key of callSettingChanged) update[`settings.${key}`] = settings[key];
  const user = await User.findByIdAndUpdate(req.session.user._id, { $set: update }, { returnDocument: 'after' });
  // The other person's app needs the new name / call availability.
  if (name || callSettingChanged.length) broadcastProfile(req, user);
  res.json({ user: selfUser(user) });
}

export async function uploadAvatar(req, res) {
  const file = uploadedFile(req, 'file');
  try {
    if (!file) throw badRequest('Choose a photo.', 'FILE_REQUIRED');
    const avatar = await storeAvatar(file);
    const previous = req.session.user.avatar?.key ? req.session.user.avatar : null;
    const user = await User.findByIdAndUpdate(req.session.user._id, { $set: { avatar } }, { returnDocument: 'after' });
    if (previous) removeMedia(previous);
    broadcastProfile(req, user);
    res.json({ user: selfUser(user) });
  } finally {
    await discardTempFiles(file);
  }
}

export async function removeAvatar(req, res) {
  const previous = req.session.user.avatar?.key ? req.session.user.avatar : null;
  const user = await User.findByIdAndUpdate(req.session.user._id, { $unset: { avatar: 1 } }, { returnDocument: 'after' });
  if (previous) removeMedia(previous);
  broadcastProfile(req, user);
  res.json({ user: selfUser(user) });
}
