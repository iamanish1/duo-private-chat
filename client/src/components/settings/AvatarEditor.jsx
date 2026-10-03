import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, ZoomIn, ZoomOut } from 'lucide-react';
import { IconButton } from '../common/IconButton';
import { Spinner } from '../common/Spinner';

const OUTPUT_SIZE = 512;
const MAX_ZOOM = 4;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const canvasToBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Circular crop editor: drag to position, pinch / wheel / slider to zoom.
 * Calls onSave(File) with a 512×512 image of exactly what's inside the circle.
 */
export function AvatarEditor({ file, onCancel, onSave, saving }) {
  const [url] = useState(() => URL.createObjectURL(file));
  const [natural, setNatural] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState(() => Math.min(300, window.innerWidth - 64));
  const imgRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  useEffect(() => {
    const onResize = () => setSize(Math.min(300, window.innerWidth - 64));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Scale at zoom 1 makes the image just cover the circle.
  const baseScale = natural ? Math.max(size / natural.w, size / natural.h) : 1;
  const scale = baseScale * zoom;

  const clampOffset = (o, z = zoom) => {
    if (!natural) return o;
    const s = baseScale * z;
    const maxX = Math.max(0, (natural.w * s - size) / 2);
    const maxY = Math.max(0, (natural.h * s - size) / 2);
    return { x: clamp(o.x, -maxX, maxX), y: clamp(o.y, -maxY, maxY) };
  };

  const applyZoom = (next) => {
    const z = clamp(next, 1, MAX_ZOOM);
    setZoom(z);
    setOffset((o) => clampOffset({ x: (o.x * z) / zoom, y: (o.y * z) / zoom }, z));
  };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    gesture.current =
      pts.length === 2
        ? { type: 'pinch', distance: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), zoom }
        : { type: 'drag', x: e.clientX, y: e.clientY, offset };
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const pts = [...pointers.current.values()];
    if (g?.type === 'pinch' && pts.length === 2) {
      applyZoom(g.zoom * (Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / g.distance));
    } else if (g?.type === 'drag') {
      setOffset(clampOffset({ x: g.offset.x + e.clientX - g.x, y: g.offset.y + e.clientY - g.y }));
    }
  };

  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    const remaining = [...pointers.current.values()];
    gesture.current = remaining.length === 1 ? { type: 'drag', x: remaining[0].x, y: remaining[0].y, offset } : null;
  };

  const save = async () => {
    if (!natural || saving) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    const k = OUTPUT_SIZE / size;
    const w = natural.w * scale;
    const h = natural.h * scale;
    ctx.drawImage(imgRef.current, (size / 2 + offset.x - w / 2) * k, (size / 2 + offset.y - h / 2) * k, w * k, h * k);
    let blob = await canvasToBlob(canvas, 'image/webp', 0.9);
    if (!blob || blob.type !== 'image/webp') blob = await canvasToBlob(canvas, 'image/jpeg', 0.9);
    onSave(new File([blob], `avatar.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`, { type: blob.type }));
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex animate-fade-in flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Adjust profile photo">
      {/* z-10: keep controls above the circle's dimming shadow. */}
      <div className="relative z-10 flex items-center justify-between px-3 pt-[calc(var(--safe-top)+12px)]">
        <IconButton label="Cancel" variant="glass" onClick={onCancel} disabled={saving}>
          <X size={22} />
        </IconButton>
        <p className="text-[15px] font-semibold">Move and zoom</p>
        <IconButton label="Save photo" variant="accent" onClick={save} disabled={!natural || saving}>
          {saving ? <Spinner size={20} /> : <Check size={22} />}
        </IconButton>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <div
          className="relative touch-none overflow-hidden rounded-full ring-2 ring-white/80 select-none"
          style={{ width: size, height: size, boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.6)' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(e) => applyZoom(zoom * (e.deltaY < 0 ? 1.08 : 0.93))}
        >
          {!natural && <Spinner size={28} className="absolute inset-0 m-auto text-white/80" />}
          <img
            ref={imgRef}
            src={url}
            alt=""
            draggable={false}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="pointer-events-none absolute top-1/2 left-1/2 max-w-none"
            style={
              natural
                ? { width: natural.w * scale, height: natural.h * scale, transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))` }
                : { opacity: 0 }
            }
          />
        </div>
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-xs items-center gap-3 px-6 pb-[calc(var(--safe-bottom)+32px)]">
        <ZoomOut size={18} className="shrink-0 text-white/70" />
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => applyZoom(Number(e.target.value))}
          className="w-full accent-[var(--c-accent)]"
          aria-label="Zoom"
        />
        <ZoomIn size={18} className="shrink-0 text-white/70" />
      </div>
    </div>,
    document.body,
  );
}
