import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginLimiter, pinLimiter, uploadLimiter } from '../middleware/security.js';
import { avatarUpload, messageUpload, songUpload } from '../middleware/upload.js';
import * as schemas from '../validators/schemas.js';
import * as auth from '../controllers/authController.js';
import { getConversation } from '../controllers/conversationController.js';
import * as messages from '../controllers/messageController.js';
import * as media from '../controllers/mediaController.js';
import * as users from '../controllers/userController.js';
import * as notifications from '../controllers/notificationController.js';
import * as calls from '../controllers/callController.js';
import * as statuses from '../controllers/statusController.js';
import * as music from '../controllers/musicController.js';

export const router = Router();

router.get('/health', (req, res) => res.json({ ok: true }));

// ---- Auth (no signup route exists, by design) ----------------------------
router.post('/auth/login', loginLimiter, validate({ body: schemas.loginBody }), auth.login);
router.post('/auth/logout', auth.logout);
router.post('/auth/lock', auth.lock);
router.get('/auth/lock-status', auth.lockStatus);
router.post('/auth/unlock', pinLimiter, validate({ body: schemas.unlockBody }), auth.unlock);
router.get('/auth/me', requireAuth, auth.me);
router.post('/auth/logout-all', requireAuth, auth.logoutEverywhere);

// Everything below requires one of the two authorized people.
router.use(requireAuth);

router.get('/conversation', getConversation);

router.get('/messages', validate({ query: schemas.listMessagesQuery }), messages.list);
router.post('/messages', validate({ body: schemas.sendMessageBody }), messages.create);
router.get('/messages/search', validate({ query: schemas.searchQuery }), messages.search);
router.get('/messages/media', validate({ query: schemas.mediaListQuery }), messages.media);
router.patch('/messages/:id/read', validate({ params: schemas.idParams }), messages.markRead);
router.put('/messages/:id/reaction', validate({ params: schemas.idParams, body: schemas.reactionBody }), messages.react);
router.patch('/messages/:id', validate({ params: schemas.idParams, body: schemas.editMessageBody }), messages.edit);
router.delete('/messages/:id', validate({ params: schemas.idParams }), messages.remove);

router.post('/media/upload', uploadLimiter, messageUpload, media.uploadMessageMedia);
router.get('/media/file/:key', media.serveLocalFile);

router.patch('/users/me', validate({ body: schemas.updateProfileBody }), users.updateProfile);
router.post('/users/me/avatar', uploadLimiter, avatarUpload, users.uploadAvatar);
router.put('/users/me/pin', pinLimiter, validate({ body: schemas.setPinBody }), users.setPin);
router.delete('/users/me/pin', pinLimiter, validate({ body: schemas.removePinBody }), users.removePin);
router.delete('/users/me/avatar', users.removeAvatar);

router.get('/notifications/public-key', notifications.getPublicKey);
router.post('/notifications/subscribe', validate({ body: schemas.pushSubscribeBody }), notifications.subscribe);
router.delete('/notifications/subscribe', validate({ body: schemas.pushUnsubscribeBody }), notifications.unsubscribe);
router.post('/notifications/test', notifications.sendTest);

router.get('/statuses', statuses.list);
router.post('/statuses', validate({ body: schemas.textStatusBody }), statuses.createText);
router.post('/statuses/media', uploadLimiter, messageUpload, statuses.createMedia);
router.post('/statuses/:id/view', validate({ params: schemas.idParams }), statuses.view);
router.delete('/statuses/:id', validate({ params: schemas.idParams }), statuses.remove);

router.get('/music', music.library);
router.post('/music/songs', uploadLimiter, songUpload, music.uploadSong);
router.patch('/music/songs/:id', validate({ params: schemas.idParams, body: schemas.songUpdateBody }), music.updateSong);
router.delete('/music/songs/:id', validate({ params: schemas.idParams }), music.deleteSong);
router.post('/music/playlists', validate({ body: schemas.playlistBody }), music.createPlaylist);
router.patch('/music/playlists/:id', validate({ params: schemas.idParams, body: schemas.playlistUpdateBody }), music.updatePlaylist);
router.delete('/music/playlists/:id', validate({ params: schemas.idParams }), music.deletePlaylist);
router.post('/music/playlists/:id/songs', validate({ params: schemas.idParams, body: schemas.playlistSongBody }), music.addToPlaylist);
router.delete('/music/playlists/:id/songs/:songId', validate({ params: schemas.playlistSongParams }), music.removeFromPlaylist);

router.get('/calls', validate({ query: schemas.callsQuery }), calls.history);
router.get('/calls/ice-servers', calls.iceServers);
