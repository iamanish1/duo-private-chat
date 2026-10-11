import { useState } from 'react';
import { Smile, Sticker } from 'lucide-react';
import { EmojiPicker } from '../chat/EmojiPicker';
import { StickerPicker } from './StickerPicker';
import { GifPicker } from './GifPicker';

const TABS = [
  { id: 'emoji', label: 'Emoji', icon: Smile },
  { id: 'stickers', label: 'Stickers', icon: Sticker },
  { id: 'gifs', label: 'GIF' },
];

/** The panel under the message box: emoji, stickers and GIFs, like WhatsApp. */
export function ExpressionPanel({ onEmoji, onSent, emojiOnly = false, className = '' }) {
  const [tab, setTab] = useState(() => {
    try {
      return emojiOnly ? 'emoji' : sessionStorage.getItem('duo-expression-tab') || 'emoji';
    } catch {
      return 'emoji';
    }
  });
  const choose = (id) => {
    setTab(id);
    try {
      sessionStorage.setItem('duo-expression-tab', id);
    } catch {
      // optional
    }
  };
  const current = emojiOnly ? 'emoji' : tab;

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="min-h-0 flex-1">
        {current === 'emoji' && <EmojiPicker onSelect={onEmoji} className="h-full" />}
        {current === 'stickers' && <StickerPicker onSent={onSent} />}
        {current === 'gifs' && <GifPicker onSent={onSent} />}
      </div>
      {!emojiOnly && (
        <div className="flex justify-center gap-1 border-t border-line px-2 py-1.5" role="tablist" aria-label="Emoji, stickers and GIFs">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={current === id}
              onClick={() => choose(id)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition ${current === id ? 'bg-accent-soft text-accent-strong' : 'text-muted hover:bg-surface-2'}`}
            >
              {Icon ? <Icon size={17} /> : <span className="rounded border border-current px-1 text-[10px] leading-4 font-black">GIF</span>}
              <span className={Icon ? '' : 'sr-only'}>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
