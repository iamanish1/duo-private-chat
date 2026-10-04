import { useState } from 'react';
import { ListEnd, ListMusic, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { BottomSheet, SheetAction } from '../common/BottomSheet';
import { Cover } from './common';
import { useMusicStore } from '../../store/musicStore';
import { addToPlaylist, createPlaylist, deleteSong, editSong, enqueue } from '../../services/musicActions';

/** Everything you can do with one song: play, queue, add to playlist, edit, delete. */
export function SongSheet({ song, onClose, onPlay }) {
  const playlists = useMusicStore((s) => s.playlists);
  const joined = useMusicStore((s) => s.joined);
  const [mode, setMode] = useState('menu'); // menu | playlists | edit | delete
  const [title, setTitle] = useState(song?.title ?? '');
  const [artist, setArtist] = useState(song?.artist ?? '');
  const [newName, setNewName] = useState('');
  if (!song) return null;

  const done = (fn) => async () => {
    await fn();
    onClose();
  };

  return (
    <BottomSheet open onClose={onClose} title={{ playlists: 'Add to playlist', edit: 'Edit song', delete: 'Delete this song?' }[mode]}>
      {mode === 'menu' && (
        <>
          <div className="mx-5 mb-2 flex items-center gap-3">
            <Cover song={song} />
            <span className="min-w-0">
              <span className="block truncate font-semibold">{song.title}</span>
              <span className="block truncate text-sm text-muted">{song.artist || 'Unknown artist'}</span>
            </span>
          </div>
          <SheetAction icon={Play} label="Play now" description="For both of you" onClick={done(onPlay)} />
          {joined && <SheetAction icon={ListEnd} label="Add to queue" onClick={done(() => enqueue(song.id))} />}
          <SheetAction icon={ListMusic} label="Add to playlist" onClick={() => setMode('playlists')} />
          <SheetAction icon={Pencil} label="Edit title & artist" onClick={() => setMode('edit')} />
          <SheetAction icon={Trash2} label="Delete from library" tone="danger" onClick={() => setMode('delete')} />
        </>
      )}

      {mode === 'playlists' && (
        <div className="px-3 pb-2">
          {playlists.map((p) => {
            const inside = p.songIds.includes(song.id);
            return (
              <SheetAction key={p.id} icon={ListMusic} label={p.name} description={inside ? 'Already in this playlist' : `${p.songIds.length} songs`} disabled={inside} onClick={done(() => addToPlaylist(p.id, song.id))} />
            );
          })}
          <form
            className="mt-2 flex gap-2 px-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newName.trim()) return;
              const created = await createPlaylist(newName.trim());
              if (created) {
                await addToPlaylist(created.playlist.id, song.id);
                onClose();
              }
            }}
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value.slice(0, 80))}
              placeholder="New playlist name"
              aria-label="New playlist name"
              className="h-11 min-w-0 flex-1 rounded-full border border-line bg-surface px-4 focus:border-accent/50 focus:outline-none"
            />
            <button type="submit" disabled={!newName.trim()} className="flex items-center gap-1 rounded-full bg-accent px-4 font-semibold text-on-accent disabled:opacity-50">
              <Plus size={17} /> Create
            </button>
          </form>
        </div>
      )}

      {mode === 'edit' && (
        <form
          className="space-y-3 px-5 pb-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await editSong(song.id, { title: title.trim(), artist: artist.trim() })) onClose();
          }}
        >
          <label className="block text-sm font-medium">
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 200))} className="mt-1 h-11 w-full rounded-2xl border border-line bg-surface px-4 font-normal focus:border-accent/50 focus:outline-none" />
          </label>
          <label className="block text-sm font-medium">
            Artist
            <input value={artist} onChange={(e) => setArtist(e.target.value.slice(0, 200))} className="mt-1 h-11 w-full rounded-2xl border border-line bg-surface px-4 font-normal focus:border-accent/50 focus:outline-none" />
          </label>
          <button type="submit" disabled={!title.trim()} className="w-full rounded-full bg-accent py-3 font-semibold text-on-accent disabled:opacity-50">
            Save
          </button>
        </form>
      )}

      {mode === 'delete' && (
        <div className="px-6 pb-2">
          <p className="text-sm text-muted">It's removed from your library and every playlist, for both of you.</p>
          <div className="mt-5 flex gap-3">
            <button type="button" onClick={() => setMode('menu')} className="flex-1 rounded-full bg-surface-2 py-3 font-semibold">
              Cancel
            </button>
            <button type="button" onClick={done(() => deleteSong(song.id))} className="flex-1 rounded-full bg-danger py-3 font-semibold text-white">
              Delete
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
