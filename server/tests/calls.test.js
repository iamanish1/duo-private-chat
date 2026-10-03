import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Call } from '../src/models/index.js';
import { USERS, connectSocket, delay, emitAck, loginAs, startTestServer, waitFor } from './helpers.js';

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
  await delay(100);
  await Call.updateMany({ active: true }, { $set: { active: false, status: 'ended' } });
});
afterAll(() => ctx.close());

const OFFER = { type: 'offer', sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n' };
const ANSWER = { type: 'answer', sdp: 'v=0\r\no=- 3 4 IN IP4 127.0.0.1\r\n' };

describe('video calls', () => {
  it('initiates, rings the other person, accepts, signals, and ends', async () => {
    const caller = await connect(alex);
    const callee = await connect(sam);

    const incoming = waitFor(callee, 'call:incoming');
    const started = await emitAck(caller, 'call:initiate');
    expect(started.ok).toBe(true);
    expect(started.call).toMatchObject({ status: 'ringing', callerId: alex.user.id, receiverId: sam.user.id, type: 'video' });

    const ring = await incoming;
    expect(ring.call.id).toBe(started.call.id);
    expect(ring.caller.name).toBe('Alex');

    const accepted = waitFor(caller, 'call:accepted');
    const acceptAck = await emitAck(callee, 'call:accept', { callId: ring.call.id });
    expect(acceptAck.call.status).toBe('accepted');
    expect((await accepted).call.status).toBe('accepted');

    // SDP + ICE are relayed between the two bound sockets.
    const offer = waitFor(callee, 'webrtc:offer');
    expect((await emitAck(caller, 'webrtc:offer', { callId: ring.call.id, description: OFFER })).relayed).toBe(true);
    expect((await offer).description).toEqual(OFFER);

    const answer = waitFor(caller, 'webrtc:answer');
    await emitAck(callee, 'webrtc:answer', { callId: ring.call.id, description: ANSWER });
    expect((await answer).description).toEqual(ANSWER);

    const ice = waitFor(callee, 'webrtc:ice-candidate');
    await emitAck(caller, 'webrtc:ice-candidate', {
      callId: ring.call.id,
      candidate: { candidate: 'candidate:1 1 udp 2122260223 192.168.1.2 54400 typ host', sdpMid: '0', sdpMLineIndex: 0 },
    });
    expect((await ice).candidate.sdpMid).toBe('0');

    await delay(1100);
    const ended = waitFor(callee, 'call:ended');
    const endAck = await emitAck(caller, 'call:end', { callId: ring.call.id });
    expect(endAck.call.status).toBe('ended');
    const endEvent = await ended;
    expect(endEvent.reason).toBe('hangup');
    expect(endEvent.call.duration).toBeGreaterThanOrEqual(1);
  });

  it('lets the receiver reject', async () => {
    const caller = await connect(alex);
    const callee = await connect(sam);
    const incoming = waitFor(callee, 'call:incoming');
    await emitAck(caller, 'call:initiate');
    const { call } = await incoming;

    const ended = waitFor(caller, 'call:ended');
    const ack = await emitAck(callee, 'call:reject', { callId: call.id });
    expect(ack.call.status).toBe('rejected');
    expect((await ended).reason).toBe('rejected');
    // The caller cannot "reject" their own call.
    const again = await emitAck(caller, 'call:initiate');
    const nope = await emitAck(caller, 'call:reject', { callId: again.call.id });
    expect(nope.ok).toBe(false);
  });

  it('allows only one active call', async () => {
    const caller = await connect(alex);
    const callee = await connect(sam);
    expect((await emitAck(caller, 'call:initiate')).ok).toBe(true);
    const busy = await emitAck(callee, 'call:initiate');
    expect(busy.ok).toBe(false);
    expect(busy.error.code).toBe('CALL_BUSY');
  });

  it('marks unanswered calls as missed', async () => {
    const caller = await connect(alex);
    await connect(sam);
    const ended = waitFor(caller, 'call:ended', 4000);
    const { call } = await emitAck(caller, 'call:initiate');
    const event = await ended;
    expect(event.reason).toBe('no-answer');
    expect((await Call.findById(call.id).lean()).status).toBe('missed');
  });

  it('does not relay signaling from sockets that are not part of the call', async () => {
    const caller = await connect(alex);
    const callee = await connect(sam);
    const otherTab = await connect(alex);
    const incoming = waitFor(callee, 'call:incoming');
    await emitAck(caller, 'call:initiate');
    const { call } = await incoming;
    await emitAck(callee, 'call:accept', { callId: call.id });

    const hijack = await emitAck(otherTab, 'webrtc:offer', { callId: call.id, description: OFFER });
    expect(hijack.relayed).toBe(false);
  });

  it('dismisses ringing on other devices once answered', async () => {
    const caller = await connect(alex);
    const phone = await connect(sam);
    const laptop = await connect(sam);
    const ring = waitFor(laptop, 'call:incoming');
    await emitAck(caller, 'call:initiate');
    const { call } = await ring;
    const elsewhere = waitFor(laptop, 'call:accepted');
    await emitAck(phone, 'call:accept', { callId: call.id });
    expect((await elsewhere).socketId).toBe(phone.id);
  });

  it('ends the call if a participant does not come back', async () => {
    const caller = await connect(alex);
    const callee = await connect(sam);
    const incoming = waitFor(callee, 'call:incoming');
    await emitAck(caller, 'call:initiate');
    const { call } = await incoming;
    await emitAck(callee, 'call:accept', { callId: call.id });

    const reconnecting = waitFor(caller, 'call:peer-reconnecting');
    const ended = waitFor(caller, 'call:ended', 4000);
    callee.close();
    expect((await reconnecting).callId).toBe(call.id);
    expect((await ended).reason).toBe('connection-lost');
  });

  it('supports voice calls end to end', async () => {
    const caller = await connect(alex);
    const callee = await connect(sam);
    const incoming = waitFor(callee, 'call:incoming');
    const started = await emitAck(caller, 'call:initiate', { type: 'audio' });
    expect(started.call.type).toBe('audio');
    expect((await incoming).call.type).toBe('audio');
    const accepted = await emitAck(callee, 'call:accept', { callId: started.call.id });
    expect(accepted.call).toMatchObject({ type: 'audio', status: 'accepted' });
    await emitAck(caller, 'call:end', { callId: started.call.id });
    expect((await Call.findById(started.call.id).lean()).type).toBe('audio');
    const history = await alex.get('/api/calls');
    expect(history.body.calls.find((c) => c.id === started.call.id).type).toBe('audio');
  });

  it('defaults to video and rejects unknown call types', async () => {
    const caller = await connect(alex);
    await connect(sam);
    const bad = await emitAck(caller, 'call:initiate', { type: 'hologram' });
    expect(bad.ok).toBe(false);
    const plain = await emitAck(caller, 'call:initiate');
    expect(plain.call.type).toBe('video');
  });

  it('respects voice and video call switches separately', async () => {
    const caller = await connect(alex);
    const callee = await connect(sam);
    let rang = false;
    callee.on('call:incoming', () => {
      rang = true;
    });

    // Video off, voice still on.
    const peerUpdate = waitFor(caller, 'user:updated');
    const off = await sam.patch('/api/users/me').send({ settings: { allowVideoCalls: false } });
    expect(off.body.user.settings).toMatchObject({ allowVideoCalls: false, allowVoiceCalls: true });
    expect(await peerUpdate).toMatchObject({ acceptsVideoCalls: false, acceptsVoiceCalls: true });
    expect((await alex.get('/api/conversation')).body.peer).toMatchObject({ acceptsVideoCalls: false, acceptsVoiceCalls: true });

    const video = await emitAck(caller, 'call:initiate', { type: 'video' });
    expect(video.ok).toBe(false);
    expect(video.error).toMatchObject({ code: 'CALLS_OFF', message: "Sam isn't taking video calls right now." });
    await delay(200);
    expect(rang).toBe(false);
    expect(await Call.findOne({ endReason: 'calls-off' }).sort({ _id: -1 }).lean()).toMatchObject({ status: 'missed', active: false, type: 'video' });

    // Voice still rings.
    const incoming = waitFor(callee, 'call:incoming');
    const voice = await emitAck(caller, 'call:initiate', { type: 'audio' });
    expect(voice.ok).toBe(true);
    await incoming;
    await emitAck(caller, 'call:end', { callId: voice.call.id });

    // Voice off too.
    await sam.patch('/api/users/me').send({ settings: { allowVoiceCalls: false } });
    const voiceOff = await emitAck(caller, 'call:initiate', { type: 'audio' });
    expect(voiceOff.error.message).toBe("Sam isn't taking voice calls right now.");

    await sam.patch('/api/users/me').send({ settings: { allowVoiceCalls: true, allowVideoCalls: true } });
    expect((await emitAck(caller, 'call:initiate', { type: 'video' })).ok).toBe(true);
    expect((await sam.patch('/api/users/me').send({ settings: { allowVideoCalls: 'nope' } })).status).toBe(400);
  });

  it('serves call history and ICE servers over REST', async () => {
    const history = await alex.get('/api/calls');
    expect(history.status).toBe(200);
    expect(history.body.calls.length).toBeGreaterThan(0);
    const ice = await alex.get('/api/calls/ice-servers');
    expect(ice.body.iceServers[0].urls[0]).toMatch(/^stun:/);
  });
});
