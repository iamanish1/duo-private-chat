import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, SendHorizontal, Trash2, X } from 'lucide-react';
import { IconButton } from '../common/IconButton';
import { Spinner } from '../common/Spinner';
import { prepareMedia } from '../../utils/media';
import { formatBytes, formatDuration } from '../../utils/format';
import { LIMITS } from '../../config';

let seq = 0;

/** Review picked photos/videos before sending: compression, validation, caption. */
export function MediaPreviewSheet({ files, onCancel, onSend }) {
  const [items, setItems] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [caption, setCaption] = useState('');

  useEffect(() => {
    let cancelled = false;
    const created = files.map((file) => ({ id: ++seq, file, status: 'processing', url: URL.createObjectURL(file), kind: file.type.startsWith('video') ? 'video' : 'image' }));
    setItems(created);
    setActiveId(created[0]?.id ?? null);
    created.forEach(async (item) => {
      try {
        const prepared = await prepareMedia(item.file);
        if (!cancelled) setItems((list) => list.map((i) => (i.id === item.id ? { ...i, status: 'ready', prepared, kind: prepared.kind } : i)));
      } catch (err) {
        if (!cancelled) setItems((list) => list.map((i) => (i.id === item.id ? { ...i, status: 'error', error: err.message } : i)));
      }
    });
    return () => {
      cancelled = true;
      created.forEach((i) => URL.revokeObjectURL(i.url));
    };
  }, [files]);

  const active = items.find((i) => i.id === activeId) ?? items[0];
  const ready = items.filter((i) => i.status === 'ready');
  const processing = items.some((i) => i.status === 'processing');

  const remove = (id) => {
    const next = items.filter((i) => i.id !== id);
    if (!next.length) return onCancel();
    setItems(next);
    if (activeId === id) setActiveId(next[0].id);
  };

  const send = () => {
    if (!ready.length || processing) return;
    onSend(ready.map((i) => i.prepared), caption);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Send media">
      <div className="flex items-center justify-between px-3 pt-safe">
        <IconButton label="Cancel" variant="glass" onClick={onCancel} className="mt-3">
          <X size={22} />
        </IconButton>
        {active && items.length > 1 && (
          <IconButton label="Remove this item" variant="glass" onClick={() => remove(active.id)} className="mt-3">
            <Trash2 size={20} />
          </IconButton>
        )}
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        {active?.kind === 'video' ? (
          <video src={active.url} controls playsInline className="max-h-full max-w-full rounded-2xl" />
        ) : active ? (
          <img src={active.url} alt="" className="max-h-full max-w-full rounded-2xl object-contain" />
        ) : null}
        {active?.status === 'processing' && (
          <span className="absolute flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm">
            <Spinner size={16} /> Preparing…
          </span>
        )}
        {active?.status === 'error' && (
          <div className="absolute inset-x-6 flex items-start gap-2 rounded-2xl bg-danger/90 px-4 py-3 text-sm">
            <CircleAlert size={18} className="mt-0.5 shrink-0" />
            <span>{active.error}</span>
          </div>
        )}
        {active?.status === 'ready' && (
          <span className="absolute top-6 rounded-full bg-black/50 px-3 py-1 text-xs text-white/80">
            {formatBytes(active.prepared.file.size)}
            {active.prepared.duration ? ` · ${formatDuration(active.prepared.duration)}` : ''}
          </span>
        )}
      </div>

      {items.length > 1 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3">
          {items.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => setActiveId(i.id)}
              className={`relative size-16 shrink-0 overflow-hidden rounded-xl ring-2 ${i.id === active?.id ? 'ring-white' : 'ring-transparent opacity-70'}`}
            >
              {i.kind === 'video' ? <video src={i.url} muted playsInline preload="metadata" className="size-full object-cover" /> : <img src={i.url} alt="" className="size-full object-cover" />}
              {i.status === 'error' && <span className="absolute inset-0 flex items-center justify-center bg-danger/70"><CircleAlert size={18} /></span>}
              {i.status === 'processing' && <span className="absolute inset-0 flex items-center justify-center bg-black/50"><Spinner size={16} /></span>}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 px-3 pt-1 pb-[calc(var(--safe-bottom)+12px)]">
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value.slice(0, LIMITS.captionLength))}
          placeholder="Add a caption…"
          rows={1}
          className="max-h-28 min-h-12 flex-1 resize-none rounded-3xl bg-white/12 px-4 py-3 text-white placeholder:text-white/50 focus:bg-white/18 focus:outline-none"
        />
        <IconButton label={`Send ${ready.length || ''}`} variant="accent" size="lg" onClick={send} disabled={!ready.length || processing}>
          <SendHorizontal size={22} />
        </IconButton>
      </div>
    </div>,
    document.body,
  );
}
