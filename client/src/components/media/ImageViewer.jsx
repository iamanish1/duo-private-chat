import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut } from 'lucide-react';
import { IconButton } from '../common/IconButton';
import { Spinner } from '../common/Spinner';
import { resolveUrl } from '../../utils/url';

const MAX_SCALE = 4;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** Full-screen photo viewer: pinch / wheel / double-tap zoom, pan, swipe down to close. */
export function ImageViewer({ src, thumbnail, alt = '', caption, onClose }) {
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [dismissY, setDismissY] = useState(0);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const lastTap = useRef(0);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const zoomTo = (scale, origin = { x: 0, y: 0 }) =>
    setView((v) => {
      const next = clamp(scale, 1, MAX_SCALE);
      if (next === 1) return { scale: 1, x: 0, y: 0 };
      const ratio = next / v.scale;
      return { scale: next, x: origin.x - (origin.x - v.x) * ratio, y: origin.y - (origin.y - v.y) * ratio };
    });

  const centerOffset = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 };
  };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      gesture.current = { type: 'pinch', distance: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), start: view };
    } else {
      gesture.current = { type: 'pan', x: e.clientX, y: e.clientY, start: view };
      const now = Date.now();
      if (now - lastTap.current < 280) zoomTo(view.scale > 1 ? 1 : 2.5, centerOffset(e));
      lastTap.current = now;
    }
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const pts = [...pointers.current.values()];
    if (g.type === 'pinch' && pts.length === 2) {
      const distance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const scale = clamp(g.start.scale * (distance / g.distance), 1, MAX_SCALE);
      setView({ ...g.start, scale, ...(scale === 1 && { x: 0, y: 0 }) });
    } else if (g.type === 'pan') {
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (g.start.scale > 1) setView({ ...g.start, x: g.start.x + dx, y: g.start.y + dy });
      else setDismissY(Math.max(0, dy));
    }
  };

  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      if (dismissY > 120) onClose();
      setDismissY(0);
      gesture.current = null;
    }
  };

  const onWheel = (e) => zoomTo(view.scale * (e.deltaY < 0 ? 1.15 : 0.87), centerOffset(e));

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex animate-fade-in flex-col bg-black/95 text-white"
      style={{ opacity: 1 - Math.min(dismissY / 400, 0.6) }}
      role="dialog"
      aria-modal="true"
      aria-label="Photo"
    >
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-end gap-2 px-3 pt-safe">
        <div className="mt-3 flex gap-2">
          <IconButton label="Zoom out" variant="glass" onClick={() => zoomTo(view.scale / 1.5)} disabled={view.scale <= 1} className="hidden sm:inline-flex">
            <ZoomOut size={20} />
          </IconButton>
          <IconButton label="Zoom in" variant="glass" onClick={() => zoomTo(view.scale * 1.5)} disabled={view.scale >= MAX_SCALE} className="hidden sm:inline-flex">
            <ZoomIn size={20} />
          </IconButton>
          <IconButton label="Close" variant="glass" onClick={onClose}>
            <X size={22} />
          </IconButton>
        </div>
      </div>

      <div
        className="relative flex flex-1 touch-none items-center justify-center overflow-hidden select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        {!loaded && thumbnail && <img src={resolveUrl(thumbnail)} alt="" className="absolute max-h-full max-w-full scale-100 object-contain blur-md" />}
        {!loaded && <Spinner size={28} className="absolute text-white/80" />}
        <img
          src={resolveUrl(src)}
          alt={alt}
          draggable={false}
          onLoad={() => setLoaded(true)}
          className="max-h-full max-w-full object-contain transition-transform duration-75 will-change-transform"
          style={{
            transform: `translate(${view.x}px, ${view.y + dismissY}px) scale(${view.scale})`,
            opacity: loaded ? 1 : 0,
          }}
        />
      </div>

      {caption && (
        <p className="mx-auto max-w-2xl px-6 pt-3 pb-[calc(var(--safe-bottom)+20px)] text-center text-[15px] text-white/90">{caption}</p>
      )}
    </div>,
    document.body,
  );
}
