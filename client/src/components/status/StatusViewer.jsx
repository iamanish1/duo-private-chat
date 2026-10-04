import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronUp, Eye, SendHorizontal, Trash2, X } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { IconButton } from '../common/IconButton';
import { Spinner } from '../common/Spinner';
import { useStatusesOf } from './useStatuses';
import { useStatusStore } from '../../store/statusStore';
import { useChatStore } from '../../store/chatStore';
import { toast } from '../../store/toastStore';
import { deleteStatus, markStatusViewed } from '../../services/statusActions';
import { sendText } from '../../services/chatActions';
import { STATUS, STATUS_BACKGROUNDS } from '../../config';
import { formatAgo, formatDayLabel, formatTime } from '../../utils/format';
import { resolveUrl } from '../../utils/url';

const HOLD_MS = 180;
const SWIPE_CLOSE_PX = 90;

const textSize = (text) => (text.length < 40 ? 'text-4xl' : text.length < 140 ? 'text-2xl' : 'text-xl');
const seenLabel = (at) => {
  const day = formatDayLabel(at);
  return `${day === 'Today' ? 'today' : day.toLowerCase()} at ${formatTime(at)}`;
};

/** Mounted once; shows the viewer whenever the status store asks for it. */
export function StatusViewerHost() {
  const viewer = useStatusStore((s) => s.viewer);
  if (!viewer) return null;
  return <StatusViewer key={`${viewer.ownerId}:${viewer.startId}`} ownerId={viewer.ownerId} startId={viewer.startId} />;
}

/**
 * Full-screen stories viewer: one bar per status, tap right/left to move,
 * hold to pause, swipe down to close. Opening the other person's status
 * sends a "seen" receipt; your own shows whether they've seen it.
 */
function StatusViewer({ ownerId, startId }) {
  const me = useChatStore((s) => s.me);
  const peer = useChatStore((s) => s.peer);
  const close = useStatusStore((s) => s.closeViewer);
  const items = useStatusesOf(ownerId);
  const mine = ownerId === me?.id;
  const owner = mine ? me : peer;

  const [currentId, setCurrentId] = useState(() => {
    if (startId) return startId;
    // Their statuses: start at the first one you haven't seen yet.
    return (!mine && items.find((s) => !s.viewedAt)?.id) || items[0]?.id;
  });
  const index = Math.max(0, items.findIndex((s) => s.id === currentId));
  const current = items[index];

  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [holding, setHolding] = useState(false);
  const [typing, setTyping] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reply, setReply] = useState('');
  const [dragY, setDragY] = useState(0);
  const paused = holding || typing || confirmDelete;
  const elapsed = useRef(0);
  const videoRef = useRef(null);
  const press = useRef(null);
  const replyRef = useRef(null);

  // The status on screen disappeared (deleted or expired): move on or close.
  useEffect(() => {
    if (!items.length) close();
    else if (!items.some((s) => s.id === currentId)) setCurrentId(items[Math.min(index, items.length - 1)].id);
  }, [items, currentId, index, close]);

  const next = useCallback(() => {
    if (index < items.length - 1) setCurrentId(items[index + 1].id);
    else close();
  }, [index, items, close]);
  const prev = useCallback(() => {
    if (index > 0) setCurrentId(items[index - 1].id);
    else {
      elapsed.current = 0;
      setProgress(0);
      if (videoRef.current) videoRef.current.currentTime = 0;
    }
  }, [index, items]);

  // New status on screen: restart the clock and send the "seen" receipt.
  useEffect(() => {
    elapsed.current = 0;
    setProgress(0);
    setReady(current?.type === 'text');
    if (current) markStatusViewed(current, me?.id);
  }, [current?.id]);

  // Photos and text run on a timer; videos follow their own playback.
  useEffect(() => {
    if (!current || !ready || paused) return undefined;
    const total = current.type === 'text' ? STATUS.textMs : STATUS.imageMs;
    let last = performance.now();
    let frame;
    const tick = (t) => {
      if (current.type === 'video') {
        const v = videoRef.current;
        if (v?.duration) setProgress(v.currentTime / v.duration);
      } else {
        elapsed.current += t - last;
        last = t;
        if (elapsed.current >= total) {
          next();
          return;
        }
        setProgress(elapsed.current / total);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [current, ready, paused, next]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || current?.type !== 'video') return;
    if (paused) v.pause();
    else
      v.play().catch(() => {
        // Autoplay with sound refused: play muted rather than not at all.
        v.muted = true;
        v.play().catch(() => {});
      });
  }, [paused, current, ready]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, next, prev]);

  if (!current) return null;

  const onPointerDown = (e) => {
    press.current = { x: e.clientX, y: e.clientY, at: Date.now(), timer: setTimeout(() => setHolding(true), HOLD_MS) };
  };
  const onPointerMove = (e) => {
    if (!press.current) return;
    const dy = e.clientY - press.current.y;
    if (dy > 10) setDragY(dy);
  };
  const onPointerUp = (e) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    clearTimeout(p.timer);
    const wasHolding = holding;
    setHolding(false);
    const dy = e.clientY - p.y;
    setDragY(0);
    if (dy > SWIPE_CLOSE_PX) return close();
    if (dy < -SWIPE_CLOSE_PX && !mine) return replyRef.current?.focus();
    if (wasHolding || Math.abs(dy) > 20) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX - rect.left < rect.width * 0.3) prev();
    else next();
  };

  const sendReply = (e) => {
    e.preventDefault();
    const text = reply.trim();
    if (!text) return;
    sendText(text, { status: current });
    setReply('');
    replyRef.current?.blur();
    toast.show('Reply sent');
  };

  const background = current.type === 'text' ? STATUS_BACKGROUNDS[current.background] ?? STATUS_BACKGROUNDS[0] : '#000';

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex animate-fade-in flex-col overflow-hidden text-white select-none"
      style={{ background, transform: dragY ? `translateY(${dragY}px)` : undefined, opacity: dragY ? Math.max(0.4, 1 - dragY / 500) : 1 }}
      role="dialog"
      aria-modal="true"
      aria-label={mine ? 'My status' : `${owner?.name}'s status`}
    >
      {/* Content */}
      <div className="absolute inset-0 flex items-center justify-center">
        {current.type === 'text' && (
          <p className={`max-w-xl px-8 text-center leading-snug font-semibold break-words whitespace-pre-wrap ${textSize(current.text)}`}>{current.text}</p>
        )}
        {current.type === 'image' && (
          <img
            key={current.id}
            src={resolveUrl(current.media?.url)}
            alt={current.text || 'Status photo'}
            className="max-h-full max-w-full object-contain"
            onLoad={() => setReady(true)}
            onError={() => setReady(true)}
            draggable={false}
          />
        )}
        {current.type === 'video' && (
          <video
            key={current.id}
            ref={videoRef}
            src={resolveUrl(current.media?.url)}
            poster={current.media?.thumbnailUrl ? resolveUrl(current.media.thumbnailUrl) : undefined}
            playsInline
            autoPlay
            className="max-h-full max-w-full object-contain"
            onLoadedData={() => setReady(true)}
            onEnded={next}
            onError={() => setReady(true)}
            data-status-video=""
          />
        )}
        {!ready && <Spinner className="absolute text-white/80" />}
      </div>

      {/* Tap / hold / swipe surface */}
      <div
        className="absolute inset-0 touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        data-testid="status-tap-area"
      />

      {/* Header */}
      <div className={`relative bg-gradient-to-b from-black/55 to-transparent px-3 pt-[calc(var(--safe-top)+8px)] pb-6 transition-opacity ${holding ? 'opacity-0' : ''}`}>
        <div className="flex gap-1" aria-hidden="true">
          {items.map((s, i) => (
            <span key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/35">
              <span className="block h-full rounded-full bg-white" style={{ width: `${i < index ? 100 : i === index ? progress * 100 : 0}%` }} />
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Avatar user={owner} size="sm" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate font-semibold">{mine ? 'My status' : owner?.name}</p>
            <p className="text-xs text-white/75">{formatAgo(current.createdAt)}</p>
          </div>
          {mine && (
            <IconButton label="Delete status" variant="glass" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={17} />
            </IconButton>
          )}
          <IconButton label="Close" variant="glass" size="sm" onClick={close}>
            <X size={19} />
          </IconButton>
        </div>
      </div>

      <div className="flex-1" />

      {/* Caption + footer */}
      <div className={`relative bg-gradient-to-t from-black/70 to-transparent px-4 pt-10 pb-[calc(var(--safe-bottom)+14px)] transition-opacity ${holding ? 'opacity-0' : ''}`}>
        {current.type !== 'text' && current.text && (
          <p className="mx-auto mb-4 max-w-xl text-center text-[15px] break-words whitespace-pre-wrap drop-shadow">{current.text}</p>
        )}
        {mine ? (
          <p className="flex items-center justify-center gap-2 text-sm font-medium" aria-live="polite">
            <Eye size={17} />
            {current.viewedAt ? `Seen by ${peer?.name} ${seenLabel(current.viewedAt)}` : 'Not seen yet'}
          </p>
        ) : (
          <form onSubmit={sendReply} className="mx-auto flex max-w-xl items-center gap-2">
            <input
              ref={replyRef}
              value={reply}
              onChange={(e) => setReply(e.target.value.slice(0, 4000))}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              placeholder={`Reply to ${owner?.name ?? ''}…`}
              aria-label="Reply to status"
              enterKeyHint="send"
              className="h-12 min-w-0 flex-1 rounded-full border border-white/30 bg-black/30 px-5 text-white backdrop-blur placeholder:text-white/65 focus:border-white/60 focus:outline-none"
            />
            {reply.trim() ? (
              <IconButton label="Send reply" variant="accent" size="md" type="submit" onPointerDown={(e) => e.preventDefault()}>
                <SendHorizontal size={19} />
              </IconButton>
            ) : (
              <ChevronUp size={22} className="shrink-0 text-white/70" aria-hidden="true" />
            )}
          </form>
        )}
      </div>

      {confirmDelete && (
        <div className="absolute inset-0 flex items-end justify-center bg-black/55 p-4 pb-[calc(var(--safe-bottom)+16px)] sm:items-center" onClick={() => setConfirmDelete(false)}>
          <div className="w-full max-w-sm animate-sheet-up rounded-3xl bg-surface p-5 text-ink" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold">Delete this status?</p>
            <p className="mt-1 text-sm text-muted">{peer?.name} won't be able to see it anymore.</p>
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setConfirmDelete(false)} className="flex-1 rounded-full bg-surface-2 py-3 font-semibold">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                  deleteStatus(current);
                }}
                className="flex-1 rounded-full bg-danger py-3 font-semibold text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
