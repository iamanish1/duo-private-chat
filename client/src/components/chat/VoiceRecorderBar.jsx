import { useEffect, useRef, useState } from 'react';
import { Pause, Play, SendHorizontal, Square, Trash2 } from 'lucide-react';
import { IconButton } from '../common/IconButton';
import { Waveform } from './Waveform';
import { VoiceRecorder, describeMicError } from '../../utils/voiceRecorder';
import { formatDuration } from '../../utils/format';
import { toast } from '../../store/toastStore';
import { LIMITS } from '../../config';

const LIVE_BARS = 36;
const MIN_SECONDS = 0.8;

/**
 * Replaces the composer while recording. Recording → (stop) → review → send,
 * or send straight away. Trash discards at any point.
 */
export function VoiceRecorderBar({ onSend, onClose }) {
  const recorder = useRef(null);
  const previewRef = useRef(null);
  const [phase, setPhase] = useState('starting'); // starting | recording | review
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState(() => Array(LIVE_BARS).fill(6));
  const [result, setResult] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const stopRef = useRef(null);

  useEffect(() => {
    const rec = new VoiceRecorder();
    recorder.current = rec;
    let cancelled = false;
    rec
      .start({
        maxSeconds: LIMITS.voiceSeconds,
        onLimit: () => stopRef.current?.(),
        onTick: (level, seconds) => {
          setElapsed(seconds);
          setLevels((prev) => [...prev.slice(1), Math.max(6, Math.round(level * 100))]);
        },
      })
      .then(() => {
        // Unmounted while the mic permission prompt was open: release it.
        if (cancelled) rec.cancel();
        else setPhase('recording');
      })
      .catch((err) => {
        rec.cancel();
        if (!cancelled) {
          toast.error(describeMicError(err));
          onClose();
        }
      });
    return () => {
      cancelled = true;
      rec.cancel();
    };
  }, [onClose]);

  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  const finish = async () => {
    const recording = await recorder.current.stop();
    if (recording.duration < MIN_SECONDS || !recording.blob.size) {
      toast.show('Hold on a little longer to record a voice note.');
      onClose();
      return null;
    }
    return recording;
  };

  const stopForReview = async () => {
    if (phase !== 'recording') return;
    const recording = await finish();
    if (!recording) return;
    setResult(recording);
    setPreviewUrl(URL.createObjectURL(recording.blob));
    setPhase('review');
  };
  stopRef.current = stopForReview;

  const send = async () => {
    const recording = phase === 'review' ? result : await finish();
    if (!recording) return;
    onSend(recording);
    onClose();
  };

  const discard = () => {
    recorder.current?.cancel();
    onClose();
  };

  const togglePreview = () => {
    const audio = previewRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else audio.play().catch(() => {});
  };

  return (
    <div className="mx-auto flex max-w-3xl animate-fade-in items-center gap-1.5 px-2 pt-2 pb-[calc(var(--safe-bottom)+8px)]">
      <IconButton label="Discard voice note" variant="muted" onClick={discard}>
        <Trash2 size={21} />
      </IconButton>

      <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-[22px] border border-line bg-surface px-3">
        {phase === 'review' ? (
          <>
            <audio
              ref={previewRef}
              src={previewUrl}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => {
                setPlaying(false);
                setPreviewTime(0);
              }}
              onTimeUpdate={(e) => setPreviewTime(e.currentTarget.currentTime)}
            />
            <button type="button" onClick={togglePreview} className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent" aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
            </button>
            <Waveform peaks={result.waveform} progress={previewTime / result.duration} playedClass="bg-accent" restClass="bg-muted/35" className="min-w-0 flex-1 overflow-hidden" />
            <span className="shrink-0 text-sm text-muted tabular-nums">{formatDuration(playing ? previewTime : result.duration)}</span>
          </>
        ) : (
          <>
            <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-danger" aria-hidden="true" />
            <span className="shrink-0 text-sm font-medium tabular-nums" aria-live="off">
              {formatDuration(elapsed)}
            </span>
            <Waveform peaks={levels} progress={1} playedClass="bg-accent/70" restClass="" className="min-w-0 flex-1 justify-end overflow-hidden" />
            <span className="sr-only" role="status">{phase === 'starting' ? 'Starting microphone' : 'Recording'}</span>
          </>
        )}
      </div>

      {phase === 'recording' && (
        <IconButton label="Stop and review" variant="soft" onClick={stopForReview}>
          <Square size={16} fill="currentColor" />
        </IconButton>
      )}
      <IconButton label="Send voice note" variant="accent" onClick={send} disabled={phase === 'starting'}>
        <SendHorizontal size={20} />
      </IconButton>
    </div>
  );
}
