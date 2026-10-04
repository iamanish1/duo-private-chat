import { badRequest } from '../utils/AppError.js';
import { uploadedFile } from '../middleware/upload.js';
import { discardTempFiles } from '../services/mediaService.js';
import * as music from '../services/musicService.js';
import { forgetSong } from '../services/listenService.js';
import { emitToConversation } from '../sockets/realtime.js';

// Both people's devices hear about library changes, so lists stay live.
const publish = (req, event, payload) => emitToConversation(req.session.conversation._id, event, payload);
const songOut = music.serializeSong;
const playlistOut = music.serializePlaylist;

export async function library(req, res) {
  const { songs, playlists } = await music.listLibrary(req.session);
  res.json({ songs: songs.map(songOut), playlists: playlists.map(playlistOut) });
}

export async function uploadSong(req, res) {
  const file = uploadedFile(req, 'file');
  try {
    if (!file) throw badRequest('Choose a song to upload.', 'FILE_REQUIRED');
    const song = songOut(await music.addSong(req.session, file));
    publish(req, 'music:song', song);
    res.status(201).json({ song });
  } finally {
    await discardTempFiles(file);
  }
}

export async function updateSong(req, res) {
  const song = songOut(await music.updateSong(req.session, req.valid.params.id, req.valid.body));
  publish(req, 'music:song', song);
  res.json({ song });
}

export async function deleteSong(req, res) {
  const { id } = req.valid.params;
  const playlists = await music.deleteSong(req.session, id);
  publish(req, 'music:song-removed', { id });
  playlists.forEach((p) => publish(req, 'music:playlist', playlistOut(p)));
  forgetSong(req.session.conversation._id, id);
  res.status(204).end();
}

export async function createPlaylist(req, res) {
  const playlist = playlistOut(await music.createPlaylist(req.session, req.valid.body));
  publish(req, 'music:playlist', playlist);
  res.status(201).json({ playlist });
}

export async function updatePlaylist(req, res) {
  const { id } = req.valid.params;
  const { name, songIds } = req.valid.body;
  let doc;
  if (name !== undefined) doc = await music.renamePlaylist(req.session, id, { name });
  if (songIds !== undefined) doc = await music.reorderPlaylist(req.session, id, songIds);
  const playlist = playlistOut(doc);
  publish(req, 'music:playlist', playlist);
  res.json({ playlist });
}

export async function deletePlaylist(req, res) {
  await music.deletePlaylist(req.session, req.valid.params.id);
  publish(req, 'music:playlist-removed', { id: req.valid.params.id });
  res.status(204).end();
}

export async function addToPlaylist(req, res) {
  const playlist = playlistOut(await music.addToPlaylist(req.session, req.valid.params.id, req.valid.body.songId));
  publish(req, 'music:playlist', playlist);
  res.json({ playlist });
}

export async function removeFromPlaylist(req, res) {
  const playlist = playlistOut(await music.removeFromPlaylist(req.session, req.valid.params.id, req.valid.params.songId));
  publish(req, 'music:playlist', playlist);
  res.json({ playlist });
}
