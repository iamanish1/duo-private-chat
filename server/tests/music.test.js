import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Playlist, Song } from '../src/models/index.js';
import { titleFromFileName } from '../src/services/musicService.js';
import { resetListenState } from '../src/services/listenService.js';
import { PNG_BYTES, USERS, connectSocket, delay, emitAck, loginAs, startTestServer, waitFor } from './helpers.js';

let ctx;
let alex;
let sam;
const open = [];
const connect = async (agent) => {
  const socket = await connectSocket(ctx.url, agent.cookie);
  open.push(socket);
  return socket;
};

/** A real, playable WAV (silence), optionally tagged with RIFF INFO title/artist. */
function wav({ seconds = 1, title, artist } = {}) {
  const rate = 8000;
  const data = Buffer.alloc(rate * seconds * 2);
  const chunk = (id, body) => {
    const head = Buffer.alloc(8);
    head.write(id, 0, 'ascii');
    head.writeUInt32LE(body.length, 4);
    return Buffer.concat([head, body, body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  };
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0); // PCM
  fmt.writeUInt16LE(1, 2); // mono
  fmt.writeUInt32LE(rate, 4);
  fmt.writeUInt32LE(rate * 2, 8);
  fmt.writeUInt16LE(2, 12);
  fmt.writeUInt16LE(16, 14);
  const tags = [];
  if (title) tags.push(chunk('INAM', Buffer.from(`${title}\0`, 'utf8')));
  if (artist) tags.push(chunk('IART', Buffer.from(`${artist}\0`, 'utf8')));
  const list = tags.length ? [chunk('LIST', Buffer.concat([Buffer.from('INFO'), ...tags]))] : [];
  const body = Buffer.concat([Buffer.from('WAVE'), chunk('fmt ', fmt), ...list, chunk('data', data)]);
  return Buffer.concat([Buffer.from('RIFF'), Buffer.from(Uint32Array.of(body.length).buffer), body]);
}

const upload = (agent, buffer, filename = 'song.wav') => agent.post('/api/music/songs').attach('file', buffer, { filename, contentType: 'audio/wav' });
const addSong = async (title) => (await upload(alex, wav({ title, artist: 'Duo Band' }))).body.song;

beforeAll(async () => {
  ctx = await startTestServer();
  alex = await loginAs(ctx.app, USERS.alex);
  sam = await loginAs(ctx.app, USERS.sam);
});
afterEach(async () => {
  open.splice(0).forEach((s) => s.close());
  resetListenState();
  await delay(30);
});
afterAll(() => ctx.close());

describe('music library', () => {
  it('uploads a song, reads its tags, and tells the other person live', async () => {
    const s = await connect(sam);
    const live = waitFor(s, 'music:song');
    const res = await upload(alex, wav({ seconds: 2, title: 'Kesariya', artist: 'Arijit Singh' }));
    expect(res.status).toBe(201);
    expect(res.body.song).toMatchObject({ title: 'Kesariya', artist: 'Arijit Singh', mimeType: 'audio/wav' });
    expect(res.body.song.duration).toBeCloseTo(2, 1);
    expect(res.body.song.url).toBeTruthy();
    expect((await live).id).toBe(res.body.song.id);
    // The file is playable from storage.
    const file = await alex.get(res.body.song.url);
    expect(file.status).toBe(200);
  });

  it('falls back to a tidy title from the file name', async () => {
    const res = await upload(alex, wav(), '03 - Tum_Hi_Ho (Lofi).wav');
    expect(res.body.song.title).toBe('Tum Hi Ho (Lofi)');
    expect(titleFromFileName('track.mp3')).toBe('track');
  });

  it('rejects files that are not audio', async () => {
    const png = await alex.post('/api/music/songs').attach('file', PNG_BYTES, { filename: 'x.mp3', contentType: 'audio/mpeg' });
    expect(png.body.error.code).toBe('INVALID_FILE_TYPE');
    const junk = await alex.post('/api/music/songs').attach('file', Buffer.from('not a song at all'), { filename: 'x.mp3', contentType: 'application/octet-stream' });
    expect(junk.status).toBe(400);
  });

  it('either person can rename; deleting removes it from playlists too', async () => {
    const song = await addSong('Old name');
    const renamed = await sam.patch(`/api/music/songs/${song.id}`).send({ title: 'New name', artist: 'Someone' });
    expect(renamed.body.song).toMatchObject({ title: 'New name', artist: 'Someone' });

    const { playlist } = (await alex.post('/api/music/playlists').send({ name: 'Road trip' })).body;
    await alex.post(`/api/music/playlists/${playlist.id}/songs`).send({ songId: song.id });
    const s = await connect(sam);
    const removed = waitFor(s, 'music:song-removed');
    const updated = waitFor(s, 'music:playlist');
    expect((await alex.delete(`/api/music/songs/${song.id}`)).status).toBe(204);
    expect((await removed).id).toBe(song.id);
    expect((await updated).songIds).toEqual([]);
    expect(await Song.findById(song.id)).toBeNull();
  });
});

describe('playlists', () => {
  it('both people build a playlist: add (no duplicates), reorder, remove, rename, delete', async () => {
    const [a, b, c] = [await addSong('A'), await addSong('B'), await addSong('C')];
    const { playlist } = (await sam.post('/api/music/playlists').send({ name: '  Our songs ' })).body;
    expect(playlist.name).toBe('Our songs');
    for (const song of [a, b, c, a]) await alex.post(`/api/music/playlists/${playlist.id}/songs`).send({ songId: song.id });
    let list = (await sam.get('/api/music')).body.playlists.find((p) => p.id === playlist.id);
    expect(list.songIds).toEqual([a.id, b.id, c.id]);

    const reordered = await sam.patch(`/api/music/playlists/${playlist.id}`).send({ songIds: [c.id, a.id, b.id] });
    expect(reordered.body.playlist.songIds).toEqual([c.id, a.id, b.id]);
    // A stale order (missing a song) is refused instead of silently losing it.
    expect((await alex.patch(`/api/music/playlists/${playlist.id}`).send({ songIds: [a.id, b.id] })).body.error.code).toBe('PLAYLIST_CHANGED');

    list = (await alex.delete(`/api/music/playlists/${playlist.id}/songs/${a.id}`)).body.playlist;
    expect(list.songIds).toEqual([c.id, b.id]);
    expect((await alex.patch(`/api/music/playlists/${playlist.id}`).send({ name: 'Renamed' })).body.playlist.name).toBe('Renamed');
    expect((await alex.post('/api/music/playlists').send({ name: '   ' })).status).toBe(400);
    expect((await sam.delete(`/api/music/playlists/${playlist.id}`)).status).toBe(204);
    expect(await Playlist.findById(playlist.id)).toBeNull();
  });
});

describe('listening together', () => {
  it('starting invites the other person; joining and controls stay in step', async () => {
    const songs = [await addSong('One'), await addSong('Two'), await addSong('Three')];
    const ids = songs.map((s) => s.id);
    const a = await connect(alex);
    const s = await connect(sam);
    const invite = waitFor(s, 'listen:invite');
    const started = await emitAck(a, 'listen:start', { songIds: ids, index: 1 });
    expect(started.room).toMatchObject({ songId: ids[1], index: 1, playing: true, position: 0, repeat: 'all', members: [alex.user.id] });
    expect(await invite).toMatchObject({ from: alex.user.id, title: 'Two' });

    expect((await emitAck(s, 'listen:control', { action: 'pause', position: 3 })).error.code).toBe('NOT_LISTENING');
    expect((await emitAck(s, 'listen:join', {})).room.members.sort()).toEqual([alex.user.id, sam.user.id].sort());

    const paused = waitFor(a, 'listen:state');
    await emitAck(s, 'listen:control', { action: 'pause', position: 42 });
    expect(await paused).toMatchObject({ playing: false, position: 42, changedBy: sam.user.id });

    expect((await emitAck(a, 'listen:control', { action: 'next' })).room).toMatchObject({ index: 2, position: 0, playing: true });
    // Repeat all: next on the last song wraps around.
    expect((await emitAck(a, 'listen:control', { action: 'next' })).room.index).toBe(0);
    // Previous early in a song goes back; later in a song it restarts it.
    expect((await emitAck(a, 'listen:control', { action: 'prev', position: 1 })).room.index).toBe(0);
    await emitAck(a, 'listen:control', { action: 'jump', index: 2 });
    expect((await emitAck(a, 'listen:control', { action: 'prev', position: 30 })).room).toMatchObject({ index: 2, position: 0 });
    expect((await emitAck(a, 'listen:control', { action: 'prev', position: 1 })).room.index).toBe(1);
  });

  it('a song ending on both phones moves on only once', async () => {
    const ids = [(await addSong('E1')).id, (await addSong('E2')).id, (await addSong('E3')).id];
    const a = await connect(alex);
    const s = await connect(sam);
    await emitAck(a, 'listen:start', { songIds: ids, index: 0 });
    await emitAck(s, 'listen:join', {});
    const [r1, r2] = await Promise.all([emitAck(a, 'listen:ended', { index: 0 }), emitAck(s, 'listen:ended', { index: 0 })]);
    expect([r1.room.index, r2.room.index]).toEqual([1, 1]);

    await emitAck(a, 'listen:control', { action: 'repeat', repeat: 'one' });
    expect((await emitAck(s, 'listen:ended', { index: 1 })).room).toMatchObject({ index: 1, position: 0, playing: true });

    await emitAck(a, 'listen:control', { action: 'repeat', repeat: 'off' });
    await emitAck(a, 'listen:control', { action: 'jump', index: 2 });
    expect((await emitAck(a, 'listen:ended', { index: 2 })).room).toMatchObject({ index: 2, playing: false });
  });

  it('queueing a song, and deleting the one playing, keep the queue right', async () => {
    const ids = [(await addSong('Q1')).id, (await addSong('Q2')).id];
    const extra = await addSong('Q3');
    const a = await connect(alex);
    await emitAck(a, 'listen:start', { songIds: ids, index: 0 });
    expect((await emitAck(a, 'listen:enqueue', { songId: extra.id })).room.queue).toEqual([...ids, extra.id]);

    const next = waitFor(a, 'listen:state');
    await alex.delete(`/api/music/songs/${ids[0]}`);
    expect(await next).toMatchObject({ queue: [ids[1], extra.id], index: 0, songId: ids[1] });
  });

  it('only songs from your own library can be played', async () => {
    const a = await connect(alex);
    const res = await emitAck(a, 'listen:start', { songIds: ['64b000000000000000000001'], index: 0 });
    expect(res.error.code).toBe('SONG_NOT_FOUND');
    expect((await emitAck(a, 'listen:join', {})).error.code).toBe('NO_LISTEN');
  });
});
