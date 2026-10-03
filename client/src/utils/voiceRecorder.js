// Voice-note recording with MediaRecorder. Picks the best container each
// browser supports (Chrome/Edge/Firefox: Opus in WebM/Ogg, Safari: AAC in MP4),
// samples mic levels for a live meter, and builds a compact waveform.

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/aac'];
const WAVEFORM_BARS = 48;
const LEVEL_INTERVAL_MS = 60;

export const voiceSupported = () =>
  typeof window !== 'undefined' && 'MediaRecorder' in window && Boolean(navigator.mediaDevices?.getUserMedia);

export function describeMicError(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return 'Microphone access is blocked. Allow it in your browser settings to record voice notes.';
  }
  if (error?.name === 'NotFoundError') return 'No microphone was found on this device.';
  if (error?.name === 'NotReadableError') return 'Your microphone is being used by another app.';
  if (!window.isSecureContext) return 'Voice notes need a secure (HTTPS) connection.';
  return "Couldn't start recording.";
}

/** Reduces raw level samples to `bars` peaks scaled 4–100. */
export function buildWaveform(samples, bars = WAVEFORM_BARS) {
  if (!samples.length) return Array(bars).fill(4);
  const bucket = samples.length / bars;
  const peaks = Array.from({ length: bars }, (_, i) => {
    const slice = samples.slice(Math.floor(i * bucket), Math.max(Math.floor((i + 1) * bucket), Math.floor(i * bucket) + 1));
    return slice.length ? Math.max(...slice) : 0;
  });
  const loudest = Math.max(...peaks, 0.05);
  return peaks.map((p) => Math.max(4, Math.round((p / loudest) * 100)));
}

export class VoiceRecorder {
  constructor() {
    this.samples = [];
    this.chunks = [];
  }

  /** Starts recording; `onTick(level 0–1, elapsedSeconds)` fires ~16×/s. */
  async start({ onTick, maxSeconds, onLimit }) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const mimeType = MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported?.(type));
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType, audioBitsPerSecond: 48_000 } : undefined);
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.start(250);
    this.startedAt = performance.now();

    // Level metering (best effort; recording works without it).
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 512;
      this.audioContext.createMediaStreamSource(this.stream).connect(analyser);
      const buffer = new Uint8Array(analyser.fftSize);
      this.timer = setInterval(() => {
        analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (const v of buffer) sum += ((v - 128) / 128) ** 2;
        const level = Math.min(1, Math.sqrt(sum / buffer.length) * 3);
        this.samples.push(level);
        const elapsed = this.elapsed();
        onTick?.(level, elapsed);
        if (maxSeconds && elapsed >= maxSeconds) onLimit?.();
      }, LEVEL_INTERVAL_MS);
    } catch {
      this.timer = setInterval(() => {
        const elapsed = this.elapsed();
        onTick?.(0, elapsed);
        if (maxSeconds && elapsed >= maxSeconds) onLimit?.();
      }, 200);
    }
  }

  elapsed() {
    return this.startedAt ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  /** Stops and returns { blob, duration, waveform, mimeType }. */
  async stop() {
    const duration = this.elapsed();
    const recorder = this.recorder;
    if (recorder && recorder.state !== 'inactive') {
      await new Promise((resolve) => {
        recorder.onstop = resolve;
        recorder.stop();
      });
    }
    const mimeType = (recorder?.mimeType || 'audio/webm').split(';')[0];
    const result = {
      blob: new Blob(this.chunks, { type: mimeType }),
      duration: Math.max(0.5, Math.round(duration * 10) / 10),
      waveform: buildWaveform(this.samples),
      mimeType,
    };
    this.cleanup();
    return result;
  }

  cancel() {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.cleanup();
  }

  cleanup() {
    clearInterval(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.audioContext?.close().catch(() => {});
    this.stream = null;
    this.audioContext = null;
  }
}
