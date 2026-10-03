import { useMemo, useRef, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { EMOJI_GROUPS, getRecentEmoji, rememberEmoji } from '../../utils/emoji';

const TAB_ICONS = { recent: null, smileys: '😊', love: '❤️', gestures: '👋', nature: '🌸', food: '🍕', activity: '🎉', travel: '✈️', objects: '💡', symbols: '✨' };

/** Lightweight, touch-friendly emoji panel with recents and category tabs. */
export function EmojiPicker({ onSelect, className = '' }) {
  const [recent, setRecent] = useState(getRecentEmoji);
  const scrollRef = useRef(null);
  const groups = useMemo(() => (recent.length ? [{ id: 'recent', label: 'Recent', emojis: recent }, ...EMOJI_GROUPS] : EMOJI_GROUPS), [recent]);

  const pick = (emoji) => {
    rememberEmoji(emoji);
    setRecent(getRecentEmoji());
    onSelect(emoji);
  };

  const jump = (id) => {
    const section = scrollRef.current?.querySelector(`[data-group="${id}"]`);
    if (section) scrollRef.current.scrollTo({ top: section.offsetTop - 4, behavior: 'smooth' });
  };

  return (
    <div className={`flex flex-col bg-surface ${className}`}>
      <div className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto border-b border-line px-2 py-1.5">
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => jump(g.id)}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-lg text-muted hover:bg-surface-2"
            aria-label={g.label}
          >
            {g.id === 'recent' ? <Clock3 size={18} /> : TAB_ICONS[g.id]}
          </button>
        ))}
      </div>
      <div ref={scrollRef} className="scroll-area relative min-h-0 flex-1 px-1.5 pb-2">
        {groups.map((g) => (
          <section key={g.id} data-group={g.id}>
            <h3 className="sticky top-0 z-[1] bg-surface px-2 pt-2 pb-1 text-xs font-semibold text-muted">{g.label}</h3>
            <div className="grid grid-cols-8 sm:grid-cols-10">
              {g.emojis.map((emoji, i) => (
                <button
                  key={`${emoji}-${i}`}
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => pick(emoji)}
                  className="flex aspect-square items-center justify-center rounded-xl text-[26px] transition hover:bg-surface-2 active:scale-90"
                  aria-label={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
