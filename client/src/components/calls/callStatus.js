import { useEffect, useState } from 'react';
import { formatDuration } from '../../utils/format';

/** Seconds since `since` (a timestamp), ticking every second while set. */
export function useElapsed(since) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!since) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return since ? Math.floor((now - since) / 1000) : 0;
}

export function statusText({ phase, reconnecting, endReason, elapsed }) {
  if (phase === 'ended') return endReason || 'Call ended';
  if (reconnecting) return 'Reconnecting…';
  if (phase === 'outgoing') return 'Calling…';
  if (phase === 'connecting') return 'Connecting…';
  return formatDuration(elapsed);
}

/** Smoothed loudness (0–1) of a stream's audio, sampled ~12×/s. */
export function useAudioLevel(stream) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!stream?.getAudioTracks().length) return undefined;
    let ctx;
    let analyser;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
    } catch {
      return undefined; // purely cosmetic
    }
    const data = new Uint8Array(analyser.fftSize);
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      const rms = Math.min(1, Math.sqrt(sum / data.length) * 4);
      setLevel((prev) => prev * 0.5 + rms * 0.5);
    }, 80);
    return () => {
      clearInterval(timer);
      ctx.close().catch(() => {});
    };
  }, [stream]);
  return level;
}
