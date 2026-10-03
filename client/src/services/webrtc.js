// WebRTC, isolated from React. A PeerSession owns one RTCPeerConnection plus
// the local media; signaling is injected via callbacks so this module knows
// nothing about Socket.IO.

const DEFAULT_ICE = [{ urls: ['stun:stun.l.google.com:19302'] }];

export function isWebRTCSupported() {
  return Boolean(window.RTCPeerConnection && navigator.mediaDevices?.getUserMedia);
}

/** Maps getUserMedia failures to messages a person can act on. */
export function describeMediaError(error, { video = true } = {}) {
  const devices = video ? 'Camera and microphone' : 'Microphone';
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return `${devices} access is blocked. Allow it in your browser settings, then try again.`;
    case 'NotFoundError':
    case 'OverconstrainedError':
      return video ? 'No camera or microphone was found on this device.' : 'No microphone was found on this device.';
    case 'NotReadableError':
    case 'AbortError':
      return `Your ${video ? 'camera' : 'microphone'} is being used by another app. Close it and try again.`;
    default:
      if (!window.isSecureContext) return 'Calls need a secure (HTTPS) connection.';
      return `Could not start your ${video ? 'camera and microphone' : 'microphone'}.`;
  }
}

const isPhone = () => window.matchMedia('(pointer: coarse)').matches && Math.min(window.screen.width, window.screen.height) < 600;

// Phones: don't force a 16:9 landscape frame — some (notably iOS) crop or
// squeeze a portrait camera into it. Let them send their natural orientation.
const videoConstraints = (facingMode) =>
  isPhone()
    ? { facingMode, frameRate: { ideal: 30, max: 30 } }
    : { facingMode, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } };

const AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48000 },
};

/** Microphone, plus camera unless `video: false` (voice calls). */
export async function getLocalMedia(facingMode = 'user', { video = true } = {}) {
  return navigator.mediaDevices.getUserMedia({
    audio: AUDIO_CONSTRAINTS,
    video: video ? videoConstraints(facingMode) : false,
  });
}

// Opus voice profile written into our SDP, which tells the *other* side's
// encoder how to send to us: 64 kbps full-band voice, in-band FEC to repair
// packet loss on mobile networks, no DTX (avoids choppy starts after silence).
const OPUS_PARAMS = {
  useinbandfec: '1',
  usedtx: '0',
  maxaveragebitrate: '64000',
  maxplaybackrate: '48000',
  stereo: '0',
  'sprop-stereo': '0',
};

export function tuneOpus(sdp) {
  const match = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/i);
  if (!match) return sdp;
  const pt = match[1];
  const fmtp = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`);
  const existing = sdp.match(fmtp);
  const params = Object.fromEntries(
    (existing?.[1] ?? '')
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => p.split('=')),
  );
  const merged = Object.entries({ ...params, ...OPUS_PARAMS })
    .map(([k, v]) => `${k}=${v}`)
    .join(';');
  if (existing) return sdp.replace(fmtp, `a=fmtp:${pt} ${merged}`);
  return sdp.replace(match[0], `${match[0]}\r\na=fmtp:${pt} ${merged}`);
}

export async function hasMultipleCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'videoinput').length > 1;
  } catch {
    return false;
  }
}

export class PeerSession {
  /**
   * @param {object} options
   * @param {RTCIceServer[]} options.iceServers  STUN/TURN from the server
   * @param {MediaStream} options.localStream
   * @param {(candidate: RTCIceCandidateInit) => void} options.onIceCandidate
   * @param {(stream: MediaStream) => void} options.onRemoteStream
   * @param {(state: RTCPeerConnectionState) => void} options.onConnectionState
   */
  constructor({ iceServers, localStream, onIceCandidate, onRemoteStream, onConnectionState }) {
    this.localStream = localStream;
    this.remoteStream = new MediaStream();
    this.pendingCandidates = [];
    this.facingMode = 'user';
    this.closed = false;

    this.pc = new RTCPeerConnection({
      iceServers: iceServers?.length ? iceServers : DEFAULT_ICE,
      bundlePolicy: 'max-bundle',
    });

    localStream.getTracks().forEach((track) => this.pc.addTrack(track, localStream));

    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) onIceCandidate(candidate.toJSON());
    };
    this.pc.ontrack = ({ track, streams }) => {
      const source = streams[0];
      (source ? source.getTracks() : [track]).forEach((t) => {
        if (!this.remoteStream.getTracks().includes(t)) this.remoteStream.addTrack(t);
      });
      onRemoteStream(this.remoteStream);
    };
    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === 'connected') this.prioritizeAudio();
      onConnectionState(this.pc.connectionState);
    };
  }

  /** Give voice the bandwidth and network priority it needs to stay clear. */
  async prioritizeAudio() {
    const sender = this.pc.getSenders().find((s) => s.track?.kind === 'audio');
    if (!sender?.getParameters) return;
    try {
      const params = sender.getParameters();
      if (!params.encodings?.length) params.encodings = [{}];
      params.encodings[0].maxBitrate = 64_000;
      params.encodings[0].priority = 'high';
      params.encodings[0].networkPriority = 'high';
      await sender.setParameters(params);
    } catch {
      // Older browsers: the SDP profile still applies.
    }
  }

  async createOffer({ iceRestart = false } = {}) {
    const offer = await this.pc.createOffer({ iceRestart });
    await this.pc.setLocalDescription({ type: offer.type, sdp: tuneOpus(offer.sdp) });
    return { type: this.pc.localDescription.type, sdp: this.pc.localDescription.sdp };
  }

  /** Applies a remote offer (initial or renegotiation) and returns the answer. */
  async answerOffer(description) {
    await this.pc.setRemoteDescription(description);
    await this.flushCandidates();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription({ type: answer.type, sdp: tuneOpus(answer.sdp) });
    return { type: this.pc.localDescription.type, sdp: this.pc.localDescription.sdp };
  }

  async acceptAnswer(description) {
    if (this.pc.signalingState !== 'have-local-offer') return;
    await this.pc.setRemoteDescription(description);
    await this.flushCandidates();
  }

  /** Candidates can arrive before the remote description; queue them. */
  async addIceCandidate(candidate) {
    if (!this.pc.remoteDescription) {
      this.pendingCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(candidate);
    } catch {
      // Stale candidates after an ICE restart are expected and harmless.
    }
  }

  async flushCandidates() {
    const queued = this.pendingCandidates.splice(0);
    for (const candidate of queued) await this.addIceCandidate(candidate);
  }

  setMicEnabled(enabled) {
    this.localStream.getAudioTracks().forEach((t) => {
      t.enabled = enabled;
    });
  }

  setCameraEnabled(enabled) {
    this.localStream.getVideoTracks().forEach((t) => {
      t.enabled = enabled;
    });
  }

  /** Swaps front/back camera without renegotiation (replaceTrack). */
  async switchCamera() {
    const next = this.facingMode === 'user' ? 'environment' : 'user';
    const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(next), audio: false });
    const [newTrack] = stream.getVideoTracks();
    const [oldTrack] = this.localStream.getVideoTracks();
    newTrack.enabled = oldTrack ? oldTrack.enabled : true;

    const sender = this.pc.getSenders().find((s) => s.track?.kind === 'video');
    await sender?.replaceTrack(newTrack);
    if (oldTrack) {
      this.localStream.removeTrack(oldTrack);
      oldTrack.stop();
    }
    this.localStream.addTrack(newTrack);
    this.facingMode = next;
    return this.facingMode;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.onconnectionstatechange = null;
    this.pc.close();
    stopStream(this.localStream);
    stopStream(this.remoteStream);
  }
}

export function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}
