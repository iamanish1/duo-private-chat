// Call state machine. Bridges the PeerSession (media/WebRTC) with Socket.IO
// signaling and mirrors everything into the call store for the UI.
import { callApi } from './api';
import { emit, emitWithAck, getSocket } from './socket';
import { PeerSession, describeMediaError, getLocalMedia, hasMultipleCameras, isWebRTCSupported, stopStream } from './webrtc';
import { isInCall, useCallStore } from '../store/callStore';
import { toast } from '../store/toastStore';
import { playEndTone, startRingback, startRingtone, stopTones } from '../utils/sounds';

const ENDED_SCREEN_MS = 1800;
const s = () => useCallStore.getState();
let session = null;
let iceServers = null;
let wakeLock = null;
let endedTimer = null;

const END_REASONS = {
  caller: { rejected: 'Declined', 'no-answer': 'No answer', cancelled: 'Call cancelled', hangup: 'Call ended', 'connection-lost': 'Connection lost' },
  callee: { rejected: 'Declined', 'no-answer': 'Missed call', cancelled: 'Missed call', hangup: 'Call ended', 'connection-lost': 'Connection lost' },
};

const activeCallId = () => s().call?.id;

async function acquireWakeLock() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    wakeLock = null;
  }
}

async function openLocalMedia() {
  if (!isWebRTCSupported()) throw new Error('Calls are not supported in this browser. Try the latest Chrome, Safari or Firefox.');
  const video = s().kind === 'video';
  let stream;
  try {
    // Voice calls ask for the microphone only — no camera prompt.
    stream = await getLocalMedia(s().facingMode, { video });
  } catch (err) {
    throw new Error(describeMediaError(err, { video }));
  }
  s().patch({ localStream: stream, micEnabled: true, cameraEnabled: video, canSwitchCamera: video && (await hasMultipleCameras()) });
  return stream;
}

async function loadIceServers() {
  try {
    ({ iceServers } = await callApi.iceServers());
  } catch {
    iceServers = null; // PeerSession falls back to public STUN
  }
}

function createSession(stream) {
  const callId = activeCallId();
  session = new PeerSession({
    iceServers,
    localStream: stream,
    onIceCandidate: (candidate) => emit('webrtc:ice-candidate', { callId, candidate }),
    onRemoteStream: (remoteStream) => s().patch({ remoteStream }),
    onConnectionState: (state) => {
      if (state === 'connected') s().patch({ phase: 'active', reconnecting: false, connectedAt: s().connectedAt ?? Date.now() });
      else if (state === 'disconnected') s().patch({ reconnecting: true });
      else if (state === 'failed') {
        s().patch({ reconnecting: true });
        restartIce();
      }
    },
  });
  // Keep the screen on for video; voice calls may let it sleep.
  if (s().kind === 'video') acquireWakeLock();
}

/** Only the caller makes offers (no glare); the callee asks for a restart. */
async function restartIce() {
  const callId = activeCallId();
  if (!session || !callId) return;
  if (s().role === 'caller') {
    try {
      emit('webrtc:offer', { callId, description: await session.createOffer({ iceRestart: true }) });
    } catch {
      // Connection is being torn down.
    }
  } else {
    emit('webrtc:restart', { callId });
  }
}

function teardown() {
  stopTones();
  session?.close();
  session = null;
  stopStream(s().localStream);
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

function finish(endReason, { silent = false } = {}) {
  if (s().phase === 'idle') return;
  teardown();
  if (silent) {
    s().reset();
    return;
  }
  playEndTone();
  s().patch({ phase: 'ended', endReason, localStream: null, remoteStream: null, reconnecting: false });
  clearTimeout(endedTimer);
  endedTimer = setTimeout(() => s().phase === 'ended' && s().reset(), ENDED_SCREEN_MS);
}

function fail(message) {
  const callId = activeCallId();
  if (callId) emit('call:end', { callId });
  teardown();
  s().reset();
  toast.error(message);
}

// ---- Public actions -------------------------------------------------------------
export async function startCall(peer, { kind = 'video' } = {}) {
  if (isInCall(s().phase)) return;
  const accepts = kind === 'audio' ? peer?.acceptsVoiceCalls : peer?.acceptsVideoCalls;
  if (accepts === false) {
    // They switched this kind of call off: skip the mic/camera prompt. The server still
    // logs the attempt as missed and replies with the reason.
    try {
      await emitWithAck('call:initiate', { type: kind });
    } catch (err) {
      toast.show(err.code === 'DISCONNECTED' ? "You're offline. Reconnect to call." : err.message);
    }
    return;
  }
  clearTimeout(endedTimer);
  s().reset();
  s().patch({ phase: 'outgoing', role: 'caller', peer, kind });
  try {
    await openLocalMedia();
    await loadIceServers();
    if (s().phase !== 'outgoing') return;
    const { call } = await emitWithAck('call:initiate', { type: kind });
    if (s().phase !== 'outgoing') {
      emit('call:end', { callId: call.id }); // hung up while we were dialing
      return;
    }
    s().patch({ call });
    startRingback();
  } catch (err) {
    fail(err.code === 'DISCONNECTED' ? "You're offline. Reconnect to call." : err.message);
  }
}

export async function acceptCall() {
  const { call, phase } = s();
  if (phase !== 'incoming' || !call) return;
  stopTones();
  s().patch({ phase: 'connecting' });
  try {
    const stream = await openLocalMedia();
    await loadIceServers();
    createSession(stream);
    await emitWithAck('call:accept', { callId: call.id });
  } catch (err) {
    fail(err.message);
  }
}

export function rejectCall() {
  const callId = activeCallId();
  if (callId) emit('call:reject', { callId });
  finish(null, { silent: true });
}

export function endCall() {
  const callId = activeCallId();
  if (callId) emit('call:end', { callId });
  finish('Call ended');
}

export function toggleMic() {
  const enabled = !s().micEnabled;
  s().localStream?.getAudioTracks().forEach((t) => {
    t.enabled = enabled;
  });
  s().patch({ micEnabled: enabled });
}

export function toggleCamera() {
  const enabled = !s().cameraEnabled;
  s().localStream?.getVideoTracks().forEach((t) => {
    t.enabled = enabled;
  });
  s().patch({ cameraEnabled: enabled });
}

export async function switchCamera() {
  if (!session) return;
  try {
    const facingMode = await session.switchCamera();
    // New MediaStream reference so the preview re-binds the new track.
    s().patch({ facingMode, localStream: new MediaStream(session.localStream.getTracks()) });
    session.localStream = s().localStream;
  } catch {
    toast.error("Couldn't switch camera.");
  }
}

// ---- Socket events ------------------------------------------------------------------
export const callSocketHandlers = {
  'call:incoming': ({ call, caller }) => {
    if (isInCall(s().phase)) return;
    clearTimeout(endedTimer);
    s().reset();
    s().patch({ phase: 'incoming', role: 'callee', call, peer: caller, kind: call.type === 'audio' ? 'audio' : 'video' });
    startRingtone();
  },

  'call:accepted': async ({ call, socketId }) => {
    if (call.id !== activeCallId()) return;
    if (s().role === 'callee') {
      if (socketId !== getSocket().id && s().phase === 'incoming') {
        finish(null, { silent: true });
        toast.show('Answered on another device');
      }
      return;
    }
    stopTones();
    s().patch({ phase: 'connecting', call });
    try {
      createSession(s().localStream);
      emit('webrtc:offer', { callId: call.id, description: await session.createOffer() });
    } catch {
      fail('Could not connect the call.');
    }
  },

  'webrtc:offer': async ({ callId, description }) => {
    if (callId !== activeCallId() || !session) return;
    try {
      emit('webrtc:answer', { callId, description: await session.answerOffer(description) });
    } catch {
      fail('Could not connect the call.');
    }
  },

  'webrtc:answer': ({ callId, description }) => {
    if (callId === activeCallId()) session?.acceptAnswer(description).catch(() => {});
  },

  'webrtc:ice-candidate': ({ callId, candidate }) => {
    if (callId === activeCallId()) session?.addIceCandidate(candidate);
  },

  'webrtc:restart': ({ callId }) => {
    if (callId === activeCallId()) restartIce();
  },

  'call:peer-reconnecting': ({ callId }) => {
    if (callId === activeCallId()) s().patch({ reconnecting: true });
  },

  'call:peer-rejoined': ({ callId }) => {
    if (callId === activeCallId() && s().role === 'caller') restartIce();
  },

  'call:ended': ({ call, reason }) => {
    if (call.id !== activeCallId()) return;
    finish(END_REASONS[s().role]?.[reason] ?? 'Call ended');
  },

  // Our own socket reconnected mid-call: re-bind it on the server.
  connect: async () => {
    const callId = activeCallId();
    if (!callId || !isInCall(s().phase)) return;
    try {
      await emitWithAck('call:rejoin', { callId });
      if (s().role === 'caller' && session) restartIce();
    } catch {
      finish('Call ended');
    }
  },
};

/** Best effort: tell the server before the page goes away mid-call. */
export function endCallOnPageHide() {
  const callId = activeCallId();
  if (callId && isInCall(s().phase)) emit(s().phase === 'incoming' ? 'call:reject' : 'call:end', { callId });
}
