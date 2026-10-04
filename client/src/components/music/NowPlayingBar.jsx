import { useNavigate } from 'react-router';
import { Hand, Headphones, Pause, Play, SkipForward } from 'lucide-react';
import { IconButton } from '../common/IconButton';
import { Cover, useAudioProgress } from './common';
import { resumeFromTap } from './ListenEngine';
import { currentSong, useMusicStore } from '../../store/musicStore';
import { useChatStore } from '../../store/chatStore';
import { control, togglePlay } from '../../services/musicActions';

/** Slim player under the chat header: what's on, play/pause, next. */
export function NowPlayingBar() {
  const navigate = useNavigate();
  const joined = useMusicStore((s) => s.joined);
  const room = useMusicStore((s) => s.room);
  const song = useMusicStore(currentSong);
  const needsTap = useMusicStore((s) => s.needsTap);
  const peer = useChatStore((s) => s.peer);
  const { current, duration } = useAudioProgress();
  if (!joined || !room || !song) return null;

  const together = room.members.includes(peer?.id);
  const pct = duration ? Math.min(100, (current / duration) * 100) : 0;

  return (
    <div className="relative z-10 border-b border-line bg-surface/95 backdrop-blur">
      <span className="absolute inset-x-0 top-0 h-0.5 bg-line" aria-hidden="true">
        <span className="block h-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </span>
      <div className="mx-auto flex max-w-3xl items-center gap-3 py-1.5 pr-1.5 pl-3">
        <button type="button" onClick={() => navigate('/music')} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label="Open the music player">
          <Cover song={song} className="size-10 rounded-lg" iconSize={17} />
          <span className="min-w-0">
            <span className="block truncate text-sm leading-tight font-semibold">{song.title}</span>
            <span className="flex items-center gap-1 truncate text-xs text-muted">
              {together ? (
                <>
                  <Headphones size={12} className="shrink-0 text-accent" /> With {peer.name}
                </>
              ) : (
                song.artist || 'Listening'
              )}
            </span>
          </span>
        </button>
        {needsTap ? (
          <button type="button" onClick={resumeFromTap} className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-2 text-xs font-semibold text-on-accent">
            <Hand size={14} /> Tap to play
          </button>
        ) : (
          <IconButton label={room.playing ? 'Pause' : 'Play'} onClick={togglePlay}>
            {room.playing ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}
          </IconButton>
        )}
        <IconButton label="Next song" onClick={() => control('next')}>
          <SkipForward size={20} fill="currentColor" />
        </IconButton>
      </div>
    </div>
  );
}
