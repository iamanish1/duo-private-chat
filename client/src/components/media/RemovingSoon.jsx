import { useEffect, useState } from 'react';
import { Bookmark, Clock, Play } from 'lucide-react';
import { chatApi } from '../../services/api';
import { keepMessage } from '../../services/chatActions';
import { formatDate, formatDuration } from '../../utils/format';
import { resolveUrl } from '../../utils/url';

/** Videos due for the 2-year clean-up within 30 days, each with "Keep forever". */
export function RemovingSoon({ onOpen }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    let active = true;
    chatApi
      .expiring()
      .then(({ messages }) => active && setItems(messages))
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
  }, []);

  if (!items?.length) return null;

  const keep = async (message) => {
    if (await keepMessage(message, true)) setItems((list) => list.filter((m) => m.id !== message.id));
  };

  return (
    <section className="mx-3 mb-5 rounded-3xl border border-line bg-surface p-3 shadow-soft" aria-label="Removing soon">
      <h2 className="flex items-center gap-2 px-1 text-sm font-semibold">
        <Clock size={16} className="text-accent" /> Removing soon
      </h2>
      <p className="px-1 pt-0.5 pb-2 text-xs text-muted">Videos are removed 2 years after they were sent. Tap “Keep forever” on the ones you want to keep.</p>
      <ul className="space-y-2">
        {items.map((m) => (
          <li key={m.id} className="flex items-center gap-3">
            <button type="button" onClick={() => onOpen(m)} className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-surface-2" aria-label="Play video">
              {m.media?.thumbnailUrl && <img src={resolveUrl(m.media.thumbnailUrl)} alt="" className="size-full object-cover" loading="lazy" />}
              <span className="absolute right-1 bottom-1 flex items-center gap-0.5 rounded-full bg-black/55 px-1.5 text-[10px] font-semibold text-white">
                <Play size={8} fill="currentColor" />
                {m.media?.duration ? formatDuration(m.media.duration) : ''}
              </span>
            </button>
            <span className="min-w-0 flex-1 text-sm">
              <span className="block font-medium">Sent {formatDate(m.createdAt)}</span>
              <span className="block text-xs text-danger">Removed on {formatDate(m.mediaRemovesAt)}</span>
            </span>
            <button type="button" onClick={() => keep(m)} className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-3 py-2 text-xs font-semibold text-accent-strong">
              <Bookmark size={14} /> Keep forever
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
