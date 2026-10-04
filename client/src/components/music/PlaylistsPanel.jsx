import { useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, ListMusic, Pencil, Play, Plus, Shuffle, Trash2, X } from 'lucide-react';
import { IconButton } from '../common/IconButton';
import { BottomSheet } from '../common/BottomSheet';
import { SongRow } from './SongRow';
import { Cover } from './common';
import { useMusicStore } from '../../store/musicStore';
import { addToPlaylist, createPlaylist, deletePlaylist, moveInPlaylist, playSongs, removeFromPlaylist, renamePlaylist, shuffled } from '../../services/musicActions';
import { formatDuration } from '../../utils/format';

function NameForm({ initial = '', submitLabel, onSubmit, onCancel }) {
  const [name, setName] = useState(initial);
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (name.trim()) await onSubmit(name.trim());
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value.slice(0, 80))}
        autoFocus
        placeholder="Playlist name"
        aria-label="Playlist name"
        className="h-11 min-w-0 flex-1 rounded-full border border-line bg-surface px-4 focus:border-accent/50 focus:outline-none"
      />
      <button type="submit" disabled={!name.trim()} className="rounded-full bg-accent px-4 font-semibold text-on-accent disabled:opacity-50">
        {submitLabel}
      </button>
      {onCancel && (
        <IconButton label="Cancel" variant="muted" onClick={onCancel}>
          <X size={18} />
        </IconButton>
      )}
    </form>
  );
}

function AddSongsSheet({ playlist, onClose }) {
  const songs = useMusicStore((s) => s.songs);
  const order = useMusicStore((s) => s.order);
  return (
    <BottomSheet open onClose={onClose} title={`Add to “${playlist.name}”`}>
      <ul className="max-h-[60vh] overflow-y-auto px-3 pb-2">
        {order.length === 0 && <p className="py-6 text-center text-sm text-muted">Upload some songs first.</p>}
        {order.map((id) => {
          const inside = playlist.songIds.includes(id);
          return (
            <SongRow key={id} song={songs[id]} onPlay={() => !inside && addToPlaylist(playlist.id, id)}>
              <span className={`mr-2 text-xs font-semibold ${inside ? 'text-online' : 'text-accent-strong'}`}>{inside ? 'Added' : <Plus size={18} />}</span>
            </SongRow>
          );
        })}
      </ul>
    </BottomSheet>
  );
}

function PlaylistDetail({ playlist, onBack }) {
  const songs = useMusicStore((s) => s.songs);
  const room = useMusicStore((s) => s.room);
  const joined = useMusicStore((s) => s.joined);
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ids = playlist.songIds.filter((id) => songs[id]);
  const total = ids.reduce((sum, id) => sum + (songs[id].duration || 0), 0);

  return (
    <div className="px-3 pt-2 pb-8">
      <div className="flex items-center gap-1">
        <IconButton label="All playlists" onClick={onBack}>
          <ArrowLeft size={20} />
        </IconButton>
        {renaming ? (
          <div className="flex-1">
            <NameForm
              initial={playlist.name}
              submitLabel="Save"
              onCancel={() => setRenaming(false)}
              onSubmit={async (name) => {
                if (await renamePlaylist(playlist.id, name)) setRenaming(false);
              }}
            />
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1 px-1">
              <h2 className="truncate text-lg font-semibold">{playlist.name}</h2>
              <p className="text-xs text-muted">
                {ids.length} songs · {formatDuration(total)}
              </p>
            </div>
            <IconButton label="Rename playlist" variant="muted" onClick={() => setRenaming(true)}>
              <Pencil size={18} />
            </IconButton>
            <IconButton label="Delete playlist" variant="muted" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={18} />
            </IconButton>
          </>
        )}
      </div>

      <div className="mt-3 flex gap-2 px-1">
        <button type="button" disabled={!ids.length} onClick={() => playSongs(ids, 0, playlist.id)} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent py-2.5 font-semibold text-on-accent disabled:opacity-50">
          <Play size={17} fill="currentColor" /> Play
        </button>
        <button type="button" disabled={!ids.length} onClick={() => playSongs(shuffled(ids), 0, playlist.id)} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-surface-2 py-2.5 font-semibold disabled:opacity-50">
          <Shuffle size={17} /> Shuffle
        </button>
        <button type="button" onClick={() => setAdding(true)} className="flex items-center justify-center gap-1.5 rounded-full bg-surface-2 px-4 py-2.5 font-semibold">
          <Plus size={17} /> Add
        </button>
      </div>

      <ul className="mt-3">
        {ids.length === 0 && <p className="py-8 text-center text-sm text-muted">No songs yet — tap Add.</p>}
        {ids.map((id, i) => (
          <SongRow key={id} song={songs[id]} playing={joined && room?.songId === id} onPlay={() => playSongs(ids, i, playlist.id)}>
            <IconButton label="Move up" variant="muted" size="sm" disabled={i === 0} onClick={() => moveInPlaylist(playlist.id, playlist.songIds.indexOf(id), playlist.songIds.indexOf(ids[i - 1]))}>
              <ChevronUp size={18} />
            </IconButton>
            <IconButton label="Move down" variant="muted" size="sm" disabled={i === ids.length - 1} onClick={() => moveInPlaylist(playlist.id, playlist.songIds.indexOf(id), playlist.songIds.indexOf(ids[i + 1]))}>
              <ChevronDown size={18} />
            </IconButton>
            <IconButton label={`Remove ${songs[id].title}`} variant="muted" size="sm" onClick={() => removeFromPlaylist(playlist.id, id)}>
              <X size={17} />
            </IconButton>
          </SongRow>
        ))}
      </ul>

      {adding && <AddSongsSheet playlist={playlist} onClose={() => setAdding(false)} />}
      <BottomSheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this playlist?">
        <div className="px-6 pb-2">
          <p className="text-sm text-muted">The songs stay in your library.</p>
          <div className="mt-5 flex gap-3">
            <button type="button" onClick={() => setConfirmDelete(false)} className="flex-1 rounded-full bg-surface-2 py-3 font-semibold">
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                setConfirmDelete(false);
                if (await deletePlaylist(playlist.id)) onBack();
              }}
              className="flex-1 rounded-full bg-danger py-3 font-semibold text-white"
            >
              Delete
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

/** Playlists you build together. */
export function PlaylistsPanel() {
  const playlists = useMusicStore((s) => s.playlists);
  const songs = useMusicStore((s) => s.songs);
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const open = playlists.find((p) => p.id === openId);

  if (open) return <PlaylistDetail playlist={open} onBack={() => setOpenId(null)} />;

  return (
    <div className="px-3 pt-3 pb-8">
      {creating ? (
        <div className="px-1">
          <NameForm
            submitLabel="Create"
            onCancel={() => setCreating(false)}
            onSubmit={async (name) => {
              const created = await createPlaylist(name);
              if (created) {
                setCreating(false);
                setOpenId(created.playlist.id);
              }
            }}
          />
        </div>
      ) : (
        <button type="button" onClick={() => setCreating(true)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left font-semibold text-accent-strong transition hover:bg-surface-2">
          <span className="flex size-12 items-center justify-center rounded-xl bg-accent-soft">
            <Plus size={22} />
          </span>
          New playlist
        </button>
      )}
      <ul className="mt-1">
        {playlists.map((p) => {
          const first = songs[p.songIds.find((id) => songs[id])];
          return (
            <li key={p.id}>
              <button type="button" onClick={() => setOpenId(p.id)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-surface-2">
                {first ? <Cover song={first} /> : <span className="flex size-12 items-center justify-center rounded-xl bg-surface-2 text-muted"><ListMusic size={20} /></span>}
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block text-[13px] text-muted">{p.songIds.filter((id) => songs[id]).length} songs</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {playlists.length === 0 && !creating && <p className="px-4 py-6 text-center text-sm text-muted">Make a playlist for a mood, a trip, or just the two of you.</p>}
    </div>
  );
}
