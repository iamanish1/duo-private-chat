import { Hand, Headphones, Pause, Play, Repeat, Repeat1, Send, Shuffle, SkipBack, SkipForward, Square } from 'lucide-react';
import { IconButton } from '../common/IconButton';
import { Avatar } from '../common/Avatar';
import { Cover, useAudioProgress } from './common';
import { SongRow } from './SongRow';
import { resumeFromTap } from './ListenEngine';
import { currentSong, useMusicStore } from '../../store/musicStore';
import { useChatStore } from '../../store/chatStore';
import { control, currentPosition, leaveListening, playSongs, ringPartner, shuffled, togglePlay } from '../../services/musicActions';
import { formatDuration } from '../../utils/format';

const NEXT_REPEAT = { off: 'all', all: 'one', one: 'off' };
const REPEAT_LABEL = { off: 'Repeat off', all: 'Repeat all', one: 'Repeat this song' };

export function NowPlayingPanel() {
  const joined = useMusicStore((s) => s.joined);
  const room = useMusicStore((s) => s.room);
  const song = useMusicStore(currentSong);
  const songs = useMusicStore((s) => s.songs);
  const order = useMusicStore((s) => s.order);
  const needsTap = useMusicStore((s) => s.needsTap);
  const me = useChatStore((s) => s.me);
  const peer = useChatStore((s) => s.peer);
  const { current, duration } = useAudioProgress();

  if (!joined || !room || !song) {
    return (
      <div className="flex flex-col items-center px-6 py-16 text-center">
        <span className="flex size-20 items-center justify-center rounded-3xl bg-accent-soft text-accent-strong">
          <Headphones size={38} />
        </span>
        <h2 className="mt-5 text-xl font-semibold">Nothing playing yet</h2>
        <p className="mt-2 max-w-xs text-sm text-muted">Pick a song or a playlist — {peer?.name ?? 'they'} can join in and you'll both hear the same thing at the same moment.</p>
        {order.length > 0 && (
          <button type="button" onClick={() => playSongs(shuffled(order), 0)} className="mt-6 flex items-center gap-2 rounded-full bg-accent px-6 py-3 font-semibold text-on-accent shadow-soft">
            <Shuffle size={18} /> Shuffle all songs
          </button>
        )}
      </div>
    );
  }

  const together = room.members.includes(peer?.id);
  const total = duration || song.duration || 0;
  const upNext = room.queue.slice(room.index + 1).map((id, i) => ({ id, i: room.index + 1 + i })).filter((x) => songs[x.id]);
  const RepeatIcon = room.repeat === 'one' ? Repeat1 : Repeat;

  return (
    <div className="mx-auto max-w-md px-5 pt-5 pb-8">
      <Cover song={song} className="mx-auto aspect-square w-full max-w-[19rem] rounded-3xl shadow-float" iconSize={72} />

      <div className="mt-6 text-center">
        <h2 className="truncate text-xl font-semibold">{song.title}</h2>
        <p className="truncate text-sm text-muted">{song.artist || 'Unknown artist'}</p>
      </div>

      <div className="mt-5">
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.floor(total))}
          step={1}
          value={Math.min(Math.floor(current), Math.floor(total))}
          onChange={(e) => control('seek', { position: Number(e.target.value) })}
          aria-label="Seek"
          className="w-full accent-[var(--c-accent)]"
        />
        <div className="flex justify-between text-xs text-muted tabular-nums">
          <span>{formatDuration(current)}</span>
          <span>{formatDuration(total)}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-4">
        <IconButton label={REPEAT_LABEL[room.repeat]} variant={room.repeat === 'off' ? 'muted' : 'ghost'} onClick={() => control('repeat', { repeat: NEXT_REPEAT[room.repeat] })} className={room.repeat === 'off' ? '' : 'text-accent'}>
          <RepeatIcon size={20} />
        </IconButton>
        <IconButton label="Previous song" size="lg" onClick={() => control('prev', { position: currentPosition() })}>
          <SkipBack size={26} fill="currentColor" />
        </IconButton>
        {needsTap ? (
          <button type="button" onClick={resumeFromTap} className="flex size-16 items-center justify-center rounded-full bg-accent text-on-accent shadow-float" aria-label="Tap to play">
            <Hand size={26} />
          </button>
        ) : (
          <IconButton label={room.playing ? 'Pause' : 'Play'} variant="accent" size="xl" onClick={togglePlay}>
            {room.playing ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" className="translate-x-0.5" />}
          </IconButton>
        )}
        <IconButton label="Next song" size="lg" onClick={() => control('next')}>
          <SkipForward size={26} fill="currentColor" />
        </IconButton>
        <IconButton label="Stop listening" variant="muted" onClick={leaveListening}>
          <Square size={18} />
        </IconButton>
      </div>
      {needsTap && <p className="mt-2 text-center text-xs text-muted">Your browser needs one tap before it plays music.</p>}

      <div className="mt-6 flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3">
        <span className="flex -space-x-2">
          <Avatar user={me} size="sm" className="ring-2 ring-surface-2" />
          {together && <Avatar user={peer} size="sm" className="ring-2 ring-surface-2" />}
        </span>
        <span className="min-w-0 flex-1 text-sm">
          {together ? (
            <>
              <span className="font-semibold">Listening with {peer.name}</span>
              <span className="block text-xs text-muted">Same song, same moment 🎧</span>
            </>
          ) : (
            <>
              <span className="font-semibold">{peer?.name} isn't listening</span>
              <span className="block text-xs text-muted">Send an invite to listen together</span>
            </>
          )}
        </span>
        {!together && (
          <button type="button" onClick={ringPartner} className="flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent">
            <Send size={14} /> Invite
          </button>
        )}
      </div>

      {upNext.length > 0 && (
        <section className="mt-6">
          <h3 className="px-1 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">Up next</h3>
          <ul>
            {upNext.slice(0, 30).map(({ id, i }) => (
              <SongRow key={`${id}-${i}`} song={songs[id]} onPlay={() => control('jump', { index: i })} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
