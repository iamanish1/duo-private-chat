import { Play } from 'lucide-react';
import { formatDuration } from '../../utils/format';
import { resolveUrl } from '../../utils/url';

export function MediaGrid({ items, onOpen }) {
  return (
    <ul className="grid grid-cols-3 gap-0.5 sm:grid-cols-4 lg:grid-cols-5">
      {items.map((m) => (
        <li key={m.id}>
          <button
            type="button"
            onClick={() => onOpen(m)}
            className="group relative block aspect-square w-full overflow-hidden bg-surface-2"
            aria-label={m.type === 'video' ? 'Play video' : 'Open photo'}
          >
            {m.media?.thumbnailUrl ? (
              <img
                src={resolveUrl(m.media.thumbnailUrl)}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-full object-cover transition duration-300 group-hover:scale-105"
              />
            ) : (
              <span className="flex size-full items-center justify-center text-muted">
                <Play size={22} />
              </span>
            )}
            {m.type === 'video' && (
              <span className="absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
                <Play size={10} fill="currentColor" />
                {m.media?.duration ? formatDuration(m.media.duration) : ''}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
