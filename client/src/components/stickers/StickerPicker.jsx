import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { BottomSheet } from '../common/BottomSheet';
import { Spinner } from '../common/Spinner';
import { StickerCreator } from './StickerCreator';
import { codeToEmoji, stickerStillUrl } from './AnimatedSticker';
import { stickerKey, useStickerStore } from '../../store/stickerStore';
import { deleteSticker, send } from '../../services/stickerActions';
import { resolveUrl } from '../../utils/url';

let dataPromise = null;
const loadData = () => (dataPromise ??= import('../../data/animatedEmoji.json').then((m) => m.default ?? m));

function Thumb({ sticker, onPick, onLongPress }) {
  const timer = useRef(null);
  const longPressed = useRef(false);
  const src = sticker.kind === 'emoji' ? stickerStillUrl(sticker.code) : resolveUrl(sticker.url);
  const label = sticker.kind === 'emoji' ? `Send ${codeToEmoji(sticker.code)} sticker` : sticker.kind === 'gif' ? `Send GIF ${sticker.title || ''}`.trim() : 'Send sticker';
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={() => {
        longPressed.current = false;
        if (onLongPress)
          timer.current = setTimeout(() => {
            longPressed.current = true;
            onLongPress();
          }, 550);
      }}
      onPointerUp={() => clearTimeout(timer.current)}
      onPointerLeave={() => clearTimeout(timer.current)}
      onContextMenu={(e) => {
        if (!onLongPress) return;
        e.preventDefault();
        onLongPress();
      }}
      onClick={() => !longPressed.current && onPick(sticker)}
      className="flex aspect-square items-center justify-center rounded-2xl p-1 transition hover:bg-surface-2 active:scale-90"
    >
      <img src={src} alt="" loading="lazy" decoding="async" className={`size-full ${sticker.kind === 'gif' ? 'rounded-xl object-cover' : 'object-contain'}`} draggable={false} />
    </button>
  );
}

/** Stickers tab: Recent, your shared tray (+ make one), then animated emojis. */
export function StickerPicker({ onSent }) {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const custom = useStickerStore((s) => s.custom);
  const recent = useStickerStore((s) => s.recent);

  useEffect(() => {
    loadData().then(setData);
  }, []);

  const pick = (sticker) => {
    send(sticker);
    onSent?.();
  };

  const groups = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const items = data.stickers.map(([code, tags, cat]) => ({ code, tags, cat }));
    if (q) {
      const hits = items.filter((i) => i.tags.includes(q) || codeToEmoji(i.code) === query.trim());
      return [{ label: hits.length ? `Results for “${query.trim()}”` : 'No stickers match', items: hits }];
    }
    return data.categories.map((label, cat) => ({ label, items: items.filter((i) => i.cat === cat) })).filter((g) => g.items.length);
  }, [data, query]);

  return (
    <div className="flex h-full flex-col">
      <label className="mx-3 mt-2 mb-1 flex items-center gap-2 rounded-full bg-surface-2 px-3">
        <Search size={16} className="text-muted" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search stickers (love, laugh, cat…)" aria-label="Search stickers" className="h-9 min-w-0 flex-1 bg-transparent text-sm focus:outline-none" />
      </label>
      <div className="scroll-area min-h-0 flex-1 px-2 pb-2">
        {!query && recent.length > 0 && (
          <section>
            <h3 className="px-2 pt-2 pb-1 text-xs font-semibold text-muted">Recent</h3>
            <div className="grid grid-cols-5 gap-1 sm:grid-cols-8">
              {recent.map((s) => (
                <Thumb key={stickerKey(s)} sticker={s} onPick={pick} />
              ))}
            </div>
          </section>
        )}
        {!query && (
          <section>
            <h3 className="px-2 pt-2 pb-1 text-xs font-semibold text-muted">Our stickers</h3>
            <div className="grid grid-cols-5 gap-1 sm:grid-cols-8">
              <button type="button" onClick={() => setCreating(true)} className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-2xl border-2 border-dashed border-line text-[11px] font-semibold text-accent-strong" aria-label="Make a sticker">
                <Plus size={20} /> Make
              </button>
              {custom.map((s) => (
                <Thumb key={s.id} sticker={{ kind: 'custom', id: s.id, url: s.url, width: s.width, height: s.height }} onPick={pick} onLongPress={() => setConfirm(s)} />
              ))}
            </div>
            {custom.length === 0 && <p className="px-2 pt-1 text-xs text-muted">Turn any photo into a sticker you both can use.</p>}
          </section>
        )}
        {!data ? (
          <div className="flex justify-center py-6 text-muted">
            <Spinner size={18} />
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.label}>
              <h3 className="px-2 pt-3 pb-1 text-xs font-semibold text-muted">{g.label}</h3>
              <div className="grid grid-cols-5 gap-1 sm:grid-cols-8">
                {g.items.map((i) => (
                  <Thumb key={i.code} sticker={{ kind: 'emoji', code: i.code }} onPick={pick} />
                ))}
              </div>
            </section>
          ))
        )}
        <p className="px-2 pt-4 pb-1 text-center text-[10px] text-muted">Animated emoji by Google (Noto, CC BY 4.0)</p>
      </div>

      {creating && <StickerCreator onClose={() => setCreating(false)} onSent={onSent} />}
      <BottomSheet open={Boolean(confirm)} onClose={() => setConfirm(null)} title="Remove this sticker?">
        <div className="px-6 pb-2">
          {confirm && <img src={resolveUrl(confirm.url)} alt="" className="mx-auto mb-3 size-24 object-contain" />}
          <p className="text-sm text-muted">It's removed from the tray for both of you. Messages that already used it keep showing it.</p>
          <div className="mt-5 flex gap-3">
            <button type="button" onClick={() => setConfirm(null)} className="flex-1 rounded-full bg-surface-2 py-3 font-semibold">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                deleteSticker(confirm.id);
                setConfirm(null);
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-danger py-3 font-semibold text-white"
            >
              <Trash2 size={16} /> Remove
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
