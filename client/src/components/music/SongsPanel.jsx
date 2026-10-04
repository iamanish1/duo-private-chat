import { useMemo, useRef, useState } from 'react';
import { CircleAlert, Music, Search, Shuffle, Upload, X } from 'lucide-react';
import { Spinner } from '../common/Spinner';
import { SongRow } from './SongRow';
import { SongSheet } from './SongSheet';
import { useMusicStore } from '../../store/musicStore';
import { dismissUpload, playSongs, shuffled, uploadSongs } from '../../services/musicActions';

const ACCEPT = 'audio/*,.mp3,.m4a,.aac,.flac,.wav,.ogg,.opus';

/** The shared library: upload, search, play, and per-song actions. */
export function SongsPanel() {
  const songs = useMusicStore((s) => s.songs);
  const order = useMusicStore((s) => s.order);
  const loaded = useMusicStore((s) => s.loaded);
  const uploads = useMusicStore((s) => s.uploads);
  const room = useMusicStore((s) => s.room);
  const joined = useMusicStore((s) => s.joined);
  const [query, setQuery] = useState('');
  const [menuFor, setMenuFor] = useState(null);
  const fileRef = useRef(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? order.filter((id) => `${songs[id].title} ${songs[id].artist} ${songs[id].album}`.toLowerCase().includes(q)) : order;
  }, [order, songs, query]);

  const playFrom = (id) => playSongs(visible, visible.indexOf(id));

  return (
    <div className="px-3 pt-3 pb-8">
      <div className="flex gap-2 px-1">
        <button type="button" onClick={() => fileRef.current?.click()} className="flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line py-3 font-semibold text-accent-strong transition hover:bg-surface-2">
          <Upload size={18} /> Upload songs
        </button>
        {order.length > 1 && (
          <button type="button" onClick={() => playSongs(shuffled(visible), 0)} className="flex items-center gap-2 rounded-2xl bg-accent px-4 font-semibold text-on-accent">
            <Shuffle size={17} /> Shuffle
          </button>
        )}
      </div>
      <p className="mt-1.5 px-2 text-center text-xs text-muted">MP3, M4A, AAC, FLAC, WAV or OGG · up to 50 MB each · pick several at once</p>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) uploadSongs(e.target.files);
          e.target.value = '';
        }}
      />

      {uploads.length > 0 && (
        <ul className="mt-3 space-y-1.5" aria-label="Uploading">
          {uploads.map((u) => (
            <li key={u.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2.5">
              {u.error ? <CircleAlert size={18} className="shrink-0 text-danger" /> : <Spinner size={18} className="shrink-0 text-muted" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{u.name}</span>
                {u.error ? (
                  <span className="block text-xs text-danger">{u.error}</span>
                ) : (
                  <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-line">
                    <span className="block h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(u.progress * 100)}%` }} />
                  </span>
                )}
              </span>
              {u.error && (
                <button type="button" onClick={() => dismissUpload(u.id)} aria-label="Dismiss" className="rounded-full p-1 text-muted">
                  <X size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {order.length > 6 && (
        <label className="mt-3 flex items-center gap-2 rounded-full border border-line bg-surface px-4">
          <Search size={17} className="text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your songs" aria-label="Search songs" className="h-11 min-w-0 flex-1 bg-transparent focus:outline-none" />
        </label>
      )}

      {!loaded ? (
        <div className="flex justify-center py-12 text-muted">
          <Spinner />
        </div>
      ) : order.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-12 text-center text-muted">
          <Music size={34} />
          <p className="mt-3 font-medium text-ink">Your library is empty</p>
          <p className="mt-1 text-sm">Upload the songs you love — both of you can add to it.</p>
        </div>
      ) : (
        <ul className="mt-2">
          {visible.map((id) => (
            <SongRow key={id} song={songs[id]} playing={joined && room?.songId === id} onPlay={() => playFrom(id)} onMore={() => setMenuFor(songs[id])} />
          ))}
          {query && !visible.length && <p className="py-8 text-center text-sm text-muted">No songs match “{query}”.</p>}
        </ul>
      )}
      {menuFor && <SongSheet song={menuFor} onClose={() => setMenuFor(null)} onPlay={() => playFrom(menuFor.id)} />}
    </div>
  );
}
