import { EllipsisVertical } from 'lucide-react';
import { IconButton } from '../common/IconButton';
import { Cover } from './common';
import { formatDuration } from '../../utils/format';

/** One song in a list; the playing one is highlighted with a little equaliser. */
export function SongRow({ song, playing, onPlay, onMore, children }) {
  return (
    <li className={`flex items-center gap-1 rounded-2xl pr-1 ${playing ? 'bg-accent-soft/60' : ''}`}>
      <button type="button" onClick={onPlay} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-surface-2" aria-label={`Play ${song.title}`}>
        <span className="relative">
          <Cover song={song} className="size-11 rounded-lg" iconSize={18} />
          {playing && (
            <span className="absolute inset-0 flex items-end justify-center gap-0.5 rounded-lg bg-black/45 pb-2" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span key={i} className="w-1 animate-pulse rounded-full bg-white" style={{ height: `${8 + ((i * 5) % 9)}px`, animationDelay: `${i * 150}ms` }} />
              ))}
            </span>
          )}
        </span>
        <span className="min-w-0">
          <span className={`block truncate text-[15px] leading-tight font-medium ${playing ? 'text-accent-strong' : ''}`}>{song.title}</span>
          <span className="block truncate text-[13px] text-muted">
            {song.artist || 'Unknown artist'} · {formatDuration(song.duration)}
          </span>
        </span>
      </button>
      {children}
      {onMore && (
        <IconButton label={`More for ${song.title}`} variant="muted" size="sm" onClick={onMore}>
          <EllipsisVertical size={18} />
        </IconButton>
      )}
    </li>
  );
}
