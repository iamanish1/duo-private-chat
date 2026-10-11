import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Circle, ImagePlus, Square, SquareRoundCorner, X } from 'lucide-react';
import { IconButton } from '../common/IconButton';
import { Spinner } from '../common/Spinner';
import { createSticker, send } from '../../services/stickerActions';
import { toast } from '../../store/toastStore';

const OUTPUT = 512;
const MAX_ZOOM = 4;
const SHAPES = [
  { id: 'rounded', label: 'Rounded', icon: SquareRoundCorner },
  { id: 'circle', label: 'Circle', icon: Circle },
  { id: 'square', label: 'Square', icon: Square },
];
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const toBlob = (canvas, type, q) => new Promise((resolve) => canvas.toBlob(resolve, type, q));

function shapePath(ctx, shape, size) {
  ctx.beginPath();
  if (shape === 'circle') ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  else if (shape === 'rounded') ctx.roundRect(0, 0, size, size, size * 0.18);
  else ctx.rect(0, 0, size, size);
}

/** Make a sticker from a photo: frame it, pick a shape, add a caption. */
export function StickerCreator({ onClose, onSent }) {
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState(null);
  const [img, setImg] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [shape, setShape] = useState('rounded');
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);
  const [size, setSize] = useState(() => Math.min(300, window.innerWidth - 64));
  const fileRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);

  useEffect(() => {
    if (!file) return undefined;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    const image = new Image();
    image.onload = () => setImg(image);
    image.onerror = () => toast.error("This photo can't be opened. Try a JPG or PNG.");
    image.src = objectUrl;
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    const onResize = () => setSize(Math.min(300, window.innerWidth - 64));
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const base = img ? Math.max(size / img.naturalWidth, size / img.naturalHeight) : 1;
  const clampOffset = (o, z = zoom) => {
    if (!img) return o;
    const s = base * z;
    const maxX = Math.max(0, (img.naturalWidth * s - size) / 2);
    const maxY = Math.max(0, (img.naturalHeight * s - size) / 2);
    return { x: clamp(o.x, -maxX, maxX), y: clamp(o.y, -maxY, maxY) };
  };
  const applyZoom = (next) => {
    const z = clamp(next, 1, MAX_ZOOM);
    setOffset((o) => clampOffset({ x: (o.x * z) / zoom, y: (o.y * z) / zoom }, z));
    setZoom(z);
  };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    gesture.current = pts.length === 2 ? { type: 'pinch', d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), zoom } : { type: 'drag', x: e.clientX, y: e.clientY, offset };
  };
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g?.type === 'drag') setOffset(clampOffset({ x: g.offset.x + e.clientX - g.x, y: g.offset.y + e.clientY - g.y }));
    if (g?.type === 'pinch') {
      const pts = [...pointers.current.values()];
      applyZoom(g.zoom * (Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / g.d));
    }
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    gesture.current = null;
  };

  /** Draws exactly what's in the frame into a 512×512 transparent image. */
  const render = async () => {
    const canvas = Object.assign(document.createElement('canvas'), { width: OUTPUT, height: OUTPUT });
    const ctx = canvas.getContext('2d');
    const k = OUTPUT / size;
    ctx.save();
    shapePath(ctx, shape, OUTPUT);
    ctx.clip();
    const s = base * zoom * k;
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, OUTPUT / 2 + offset.x * k - w / 2, OUTPUT / 2 + offset.y * k - h / 2, w, h);
    ctx.restore();
    const text = caption.trim();
    if (text) {
      let fontSize = 76;
      ctx.font = `900 ${fontSize}px system-ui, sans-serif`;
      while (ctx.measureText(text).width > OUTPUT * 0.88 && fontSize > 28) {
        fontSize -= 4;
        ctx.font = `900 ${fontSize}px system-ui, sans-serif`;
      }
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = fontSize * 0.18;
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#fff';
      const y = OUTPUT - (shape === 'circle' ? 70 : 34);
      ctx.strokeText(text, OUTPUT / 2, y);
      ctx.fillText(text, OUTPUT / 2, y);
    }
    let blob = await toBlob(canvas, 'image/webp', 0.9);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/png');
    return blob;
  };

  const save = async (andSend) => {
    if (!img || saving) return;
    setSaving(true);
    const sticker = await createSticker(await render());
    setSaving(false);
    if (!sticker) return;
    if (andSend) {
      send({ kind: 'custom', id: sticker.id, url: sticker.url, width: sticker.width, height: sticker.height });
      onSent?.();
    } else toast.show('Sticker added to the tray');
    onClose();
  };

  const radius = shape === 'circle' ? '50%' : shape === 'rounded' ? '18%' : '0';

  return createPortal(
    <div className="fixed inset-0 z-[60] flex animate-fade-in flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Make a sticker">
      <div className="flex items-center justify-between px-3 pt-[calc(var(--safe-top)+12px)]">
        <IconButton label="Cancel" variant="glass" onClick={onClose}>
          <X size={22} />
        </IconButton>
        <p className="font-semibold">Make a sticker</p>
        <span className="size-11" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6">
        {!img ? (
          <button type="button" onClick={() => fileRef.current?.click()} className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-white/30 px-10 py-12 text-white/85">
            <ImagePlus size={40} />
            <span className="font-semibold">Choose a photo</span>
            <span className="text-xs text-white/60">You'll frame it next</span>
          </button>
        ) : (
          <>
            {/* Checkerboard shows which parts will be transparent. */}
            <div
              className="relative touch-none overflow-hidden"
              style={{ width: size, height: size, borderRadius: radius, backgroundImage: 'repeating-conic-gradient(#333 0 25%, #222 0 50%)', backgroundSize: '24px 24px' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={(e) => applyZoom(zoom * (e.deltaY < 0 ? 1.08 : 0.92))}
              aria-label="Drag to move the photo, pinch or scroll to zoom"
            >
              <img
                src={url}
                alt=""
                draggable={false}
                className="pointer-events-none absolute top-1/2 left-1/2 max-w-none select-none"
                style={{ width: img.naturalWidth * base * zoom, height: img.naturalHeight * base * zoom, transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))` }}
              />
              {caption.trim() && (
                <span
                  className="pointer-events-none absolute inset-x-0 text-center leading-none font-black text-white"
                  style={{ bottom: shape === 'circle' ? size * 0.11 : size * 0.04, fontSize: Math.max(12, Math.min(size * 0.15, (size * 0.88) / Math.max(1, caption.trim().length * 0.58))), WebkitTextStroke: `${Math.max(1.5, size * 0.012)}px #000`, paintOrder: 'stroke fill' }}
                >
                  {caption.trim()}
                </span>
              )}
            </div>
            <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} onChange={(e) => applyZoom(Number(e.target.value))} aria-label="Zoom" className="w-64 accent-white" />
            <div className="flex gap-2" role="radiogroup" aria-label="Shape">
              {SHAPES.map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" role="radio" aria-checked={shape === id} onClick={() => setShape(id)} className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold ${shape === id ? 'bg-white text-black' : 'bg-white/15'}`}>
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 24))}
              placeholder="Add a caption (optional)"
              aria-label="Caption"
              className="h-11 w-full max-w-xs rounded-full bg-white/12 px-4 text-center text-white placeholder:text-white/50 focus:bg-white/18 focus:outline-none"
            />
            <button type="button" onClick={() => fileRef.current?.click()} className="text-xs font-semibold text-white/70 underline">
              Choose a different photo
            </button>
          </>
        )}
      </div>

      {img && (
        <div className="flex gap-3 px-4 pt-2 pb-[calc(var(--safe-bottom)+16px)]">
          <button type="button" onClick={() => save(false)} disabled={saving} className="flex-1 rounded-full bg-white/15 py-3.5 font-semibold disabled:opacity-60">
            Save to tray
          </button>
          <button type="button" onClick={() => save(true)} disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent py-3.5 font-semibold text-on-accent disabled:opacity-60">
            {saving && <Spinner size={16} />} Save &amp; send
          </button>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) setFile(e.target.files[0]);
          e.target.value = '';
        }}
      />
    </div>,
    document.body,
  );
}
