import { useState } from 'react';
import { ImageOff, Play, RotateCcw, X } from 'lucide-react';
import { cancelUpload, retryMessage } from '../../services/chatActions';
import { formatDuration } from '../../utils/format';
import { resolveUrl } from '../../utils/url';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function ProgressRing({ progress }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 44 44" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
      <circle cx="22" cy="22" r={r} fill="none" stroke="rgb(255 255 255 / 0.25)" strokeWidth="3" />
      <circle cx="22" cy="22" r={r} fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} className="transition-[stroke-dashoffset] duration-200" />
    </svg>
  );
}

/** Photo/video tile inside a bubble, with upload progress, failure and retry. */
export function MediaContent({ message, upload, onOpen, meta }) {
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const { media, localPreview } = message;
  const isVideo = message.type === 'video';
  const thumb = localPreview?.thumbnailUrl ?? media?.thumbnailUrl;
  const ratio = media?.width && media?.height ? clamp(media.width / media.height, 0.6, 1.8) : isVideo ? 16 / 9 : 4 / 3;
  const sending = message.status === 'sending';
  const failed = message.status === 'failed';

  return (
    <div className="relative overflow-hidden rounded-[16px] bg-surface-2" style={{ aspectRatio: ratio, width: 'min(68vw, 300px)' }}>
      <button
        type="button"
        onClick={() => !sending && !failed && onOpen(message)}
        className="absolute inset-0 block size-full"
        aria-label={isVideo ? 'Play video' : 'Open photo'}
      >
        {thumb && !broken ? (
          <img
            src={resolveUrl(thumb)}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => setBroken(true)}
            className={`size-full object-cover transition duration-500 [-webkit-touch-callout:none] ${loaded ? 'opacity-100 blur-0' : 'opacity-0 blur-sm'}`}
          />
        ) : (
          <span className="flex size-full items-center justify-center text-muted">{broken ? <ImageOff size={26} /> : null}</span>
        )}
        {!loaded && !broken && thumb && <span className="absolute inset-0 animate-pulse bg-surface-2" />}
      </button>

      {isVideo && !sending && !failed && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md">
            <Play size={24} fill="currentColor" className="ml-1" />
          </span>
        </span>
      )}
      {isVideo && media?.duration ? (
        <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
          {formatDuration(media.duration)}
        </span>
      ) : null}

      {sending && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/25">
          <button type="button" onClick={() => cancelUpload(message.clientId)} className="relative flex size-12 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur" aria-label="Cancel upload">
            <ProgressRing progress={upload?.progress ?? 0} />
            <X size={18} />
          </button>
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 px-4 text-center text-white">
          <button type="button" onClick={() => retryMessage(message)} className="flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-semibold backdrop-blur hover:bg-white/30">
            <RotateCcw size={16} /> Retry
          </button>
          <span className="line-clamp-2 text-xs text-white/80">{message.error || 'Upload failed'}</span>
        </div>
      )}
      {meta && <span className="pointer-events-none absolute right-2 bottom-2 flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">{meta}</span>}
    </div>
  );
}
