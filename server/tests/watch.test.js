import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PushSubscription } from '../src/models/index.js';
import { setPushSender } from '../src/services/pushService.js';
import { resetWatchState } from '../src/services/watchService.js';
import { USERS, connectSocket, delay, emitAck, loginAs, startTestServer, waitFor } from './helpers.js';

const VIDEO = 'dQw4w9WgXcQ';
const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };

let ctx;
let alex;
let sam;
const open = [];
const connect = async (agent) => {
  const socket = await connectSocket(ctx.url, agent.cookie);
  open.push(socket);
  return socket;
};

beforeAll(async () => {
  ctx = await startTestServer();
  alex = await loginAs(ctx.app, USERS.alex);
  sam = await loginAs(ctx.app, USERS.sam);
});
afterEach(async () => {
  open.splice(0).forEach((s) => s.close());
  setPushSender(null);
  resetWatchState();
  await delay(50);
});
afterAll(() => ctx.close());

describe('watch together', () => {
  it('starting invites the other person live and by push', async () => {
    const pushes = [];
    setPushSender(async (sub, body) => {
      pushes.push(JSON.parse(body));
      return { statusCode: 201 };
    });
    await PushSubscription.deleteMany({});
    await PushSubscription.create({ userId: sam.user.id, endpoint: 'https://fcm.googleapis.com/fcm/send/sam', keys });

    const a = await connect(alex);
    const s = await connect(sam);
    const invite = waitFor(s, 'watch:invite');
    const res = await emitAck(a, 'watch:start', { videoId: VIDEO });
    expect(res.ok).toBe(true);
    expect(res.room).toMatchObject({ videoId: VIDEO, playing: true, position: 0, members: [alex.user.id], startedBy: alex.user.id });
    expect(await invite).toMatchObject({ from: alex.user.id, videoId: VIDEO });
    await delay(100);
    expect(pushes[0]).toMatchObject({ type: 'watch', url: '/watch', title: alex.user.name });
  });

  it('rejects anything that is not a YouTube video id', async () => {
    const a = await connect(alex);
    for (const videoId of ['', 'short', 'https://evil.example/x', 'a'.repeat(12), '<script>x</']) {
      expect((await emitAck(a, 'watch:start', { videoId })).ok).toBe(false);
    }
  });

  it('joining, then play/pause/seek reach the other person with server time', async () => {
    const a = await connect(alex);
    const s = await connect(sam);
    await emitAck(a, 'watch:start', { videoId: VIDEO });
    expect((await emitAck(s, 'watch:control', { action: 'pause', position: 5 })).error.code).toBe('NOT_WATCHING');

    const joined = await emitAck(s, 'watch:join', {});
    expect(joined.room.members.sort()).toEqual([alex.user.id, sam.user.id].sort());

    const paused = waitFor(a, 'watch:state');
    await emitAck(s, 'watch:control', { action: 'pause', position: 42.5 });
    expect(await paused).toMatchObject({ playing: false, position: 42.5, changedBy: sam.user.id });

    const seeked = waitFor(s, 'watch:state');
    const before = Date.now();
    await emitAck(a, 'watch:control', { action: 'seek', position: 600 });
    const state = await seeked;
    expect(state).toMatchObject({ playing: false, position: 600, changedBy: alex.user.id });
    expect(state.serverNow).toBeGreaterThanOrEqual(before);

    const played = waitFor(s, 'watch:state');
    await emitAck(a, 'watch:control', { action: 'play', position: 600 });
    expect((await played).playing).toBe(true);
  });

  it('switching video resets to the start for both', async () => {
    const a = await connect(alex);
    const s = await connect(sam);
    await emitAck(a, 'watch:start', { videoId: VIDEO });
    await emitAck(s, 'watch:join', {});
    await emitAck(a, 'watch:control', { action: 'seek', position: 300 });
    const next = waitFor(a, 'watch:state');
    await emitAck(s, 'watch:start', { videoId: 'jNQXAC9IVRw' });
    expect(await next).toMatchObject({ videoId: 'jNQXAC9IVRw', position: 0, playing: true, changedBy: sam.user.id });
  });

  it('reactions float to both people; leaving updates who is watching', async () => {
    const a = await connect(alex);
    const s = await connect(sam);
    await emitAck(a, 'watch:start', { videoId: VIDEO });
    await emitAck(s, 'watch:join', {});
    const reaction = waitFor(a, 'watch:reaction');
    await emitAck(s, 'watch:react', { emoji: '😂' });
    expect(await reaction).toEqual({ from: sam.user.id, emoji: '😂' });

    const left = waitFor(a, 'watch:state');
    await emitAck(s, 'watch:leave', {});
    expect((await left).members).toEqual([alex.user.id]);

    // A dropped connection counts as leaving too.
    const s2 = await connect(sam);
    await emitAck(s2, 'watch:join', {});
    const dropped = new Promise((resolve) => a.on('watch:state', (st) => st.members.length === 1 && resolve(st)));
    s2.close();
    expect((await dropped).members).toEqual([alex.user.id]);
  });

  it('nothing to join when no one started a session', async () => {
    const s = await connect(sam);
    const res = await emitAck(s, 'watch:join', {});
    expect(res.error.code).toBe('NO_WATCH');
    expect((await emitAck(s, 'watch:get', {})).room).toBeNull();
  });
});
