import { Headphones, X } from 'lucide-react';
import { useMusicStore } from '../../store/musicStore';
import { useChatStore } from '../../store/chatStore';
import { joinListening } from '../../services/musicActions';

/** "Anishka is listening to … — Listen". Joining starts the music right here. */
export function ListenInviteBanner() {
  const invite = useMusicStore((s) => s.invite);
  const room = useMusicStore((s) => s.room);
  const songs = useMusicStore((s) => s.songs);
  const dismiss = useMusicStore((s) => s.dismissInvite);
  const peer = useChatStore((s) => s.peer);
  const myId = useChatStore((s) => s.me?.id);
  const joined = useMusicStore((s) => s.joined);
  const dismissed = useMusicStore((s) => s.inviteDismissed);
  const theyreListening = room && myId && room.members.length > 0 && !room.members.includes(myId);
  if (!theyreListening || joined || dismissed) return null;
  const song = songs[room.songId];
  const title = song?.title ?? invite?.title;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[46] flex justify-center px-3 pb-[calc(var(--safe-bottom)+84px)]">
      <div className="pointer-events-auto flex w-full max-w-md animate-sheet-up items-center gap-3 rounded-3xl border border-line bg-surface p-3 pl-4 shadow-float" role="alert">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-strong">
          <Headphones size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{peer?.name} is listening</span>
          <span className="block truncate text-xs text-muted">{title ? `${title}${song?.artist ? ` · ${song.artist}` : ''}` : 'Listen together?'}</span>
        </span>
        <button type="button" onClick={joinListening} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent">
          Listen
        </button>
        <button type="button" onClick={dismiss} aria-label="Not now" className="rounded-full p-1.5 text-muted hover:bg-surface-2">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
