import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, X } from 'lucide-react';
import { Waveform } from './Waveform';
import { Spinner } from '../common/Spinner';
import { cancelUpload, retryMessage } from '../../services/chatActions';
import { formatDuration } from '../../utils/format';
import { resolveUrl } from '../../utils/url';

const SPEEDS = [1, 1.5, 2];
const FLAT = Array(48).fill(30);
// Only one voice note plays at a time across the chat.
let activeAudio = null;

/** Voice-note bubble content: play/pause, seekable waveform, timer, speed. */
export function VoiceNote({ message, mine, upload }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const src = resolveUrl(message.localPreview?.url ?? message.media?.url);
  // MediaRecorder WebM files often report Infinity; trust the recorded length.
  const duration = message.media?.duration || audioRef.current?.duration || 0;
  const progress = duration ? Math.min(1, current / duration) : 0;
  const sending = message.status === 'sending';
  const uploadFailed = message.status === 'failed';

  useEffect(() => () => audioRef.current?.pause(), []);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    if (activeAudio && activeAudio !== audio) activeAudio.pause();
    activeAudio = audio;
    audio.playbackRate = speed;
    setLoading(true);
    try {
      await audio.play();
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const seek = (ratio) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = ratio * duration;
    setCurrent(audio.currentTime);
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const button = mine ? 'bg-white/20 text-on-accent hover:bg-white/30' : 'bg-accent text-on-accent hover:bg-accent-strong';

  return (
    <div className="flex w-[min(64vw,250px)] items-center gap-2.5 py-0.5">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onError={() => setFailed(true)}
      />

      {uploadFailed ? (
        <button type="button" onClick={() => retryMessage(message)} className={`flex size-10 shrink-0 items-center justify-center rounded-full ${button}`} aria-label="Retry sending">
          <RotateCcw size={18} />
        </button>
      ) : sending ? (
        <button type="button" onClick={() => cancelUpload(message.clientId)} className={`relative flex size-10 shrink-0 items-center justify-center rounded-full ${button}`} aria-label="Cancel sending">
          <Spinner size={36} className="absolute opacity-60" label="Sending" />
          <X size={15} />
        </button>
      ) : (
        <button type="button" onClick={toggle} className={`flex size-10 shrink-0 items-center justify-center rounded-full transition active:scale-90 ${button}`} aria-label={playing ? 'Pause voice note' : 'Play voice note'}>
          {loading ? <Spinner size={18} /> : playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
        </button>
      )}

      <div className="min-w-0 flex-1">
        <Waveform
          peaks={message.media?.waveform ?? FLAT}
          progress={progress}
          onSeek={sending || uploadFailed ? undefined : seek}
          playedClass={mine ? 'bg-on-accent' : 'bg-accent'}
          restClass={mine ? 'bg-on-accent/40' : 'bg-muted/35'}
        />
        <div className={`mt-0.5 flex items-center gap-2 text-[11px] tabular-nums ${mine ? 'text-on-accent/80' : 'text-muted'}`}>
          <span>
            {uploadFailed
              ? message.error || 'Not sent'
              : sending
                ? `Sending${upload?.progress ? ` ${Math.round(upload.progress * 100)}%` : '…'}`
                : failed
                  ? "Can't play here"
                  : formatDuration(playing || current ? current : duration)}
          </span>
          {(playing || speed !== 1) && (
            <button type="button" onClick={cycleSpeed} className={`rounded-full px-1.5 font-semibold ${mine ? 'bg-white/20' : 'bg-surface-2'}`} aria-label="Playback speed">
              {speed}×
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
