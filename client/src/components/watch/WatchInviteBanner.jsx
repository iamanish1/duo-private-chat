import { Popcorn, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { useWatchStore } from '../../store/watchStore';
import { useChatStore } from '../../store/chatStore';

/** "Anishka wants to watch together" — shown anywhere in the app except the watch screen. */
export function WatchInviteBanner() {
  const invite = useWatchStore((s) => s.invite);
  const room = useWatchStore((s) => s.room);
  const joined = useWatchStore((s) => s.joined);
  const dismissed = useWatchStore((s) => s.inviteDismissed);
  const dismiss = useWatchStore((s) => s.dismissInvite);
  const peer = useChatStore((s) => s.peer);
  const myId = useChatStore((s) => s.me?.id);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // Shown while they're watching and we aren't (derived, so it never depends on load order).
  const theyreWatching = room && myId && room.members.length > 0 && !room.members.includes(myId);
  if (!theyreWatching || joined || dismissed || pathname === '/watch') return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[46] flex justify-center px-3 pt-[calc(var(--safe-top)+70px)]">
      <div className="pointer-events-auto flex w-full max-w-md animate-sheet-up items-center gap-3 rounded-3xl border border-line bg-surface p-3 pl-4 shadow-float" role="alert">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-strong">
          <Popcorn size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{peer?.name} wants to watch together</span>
          <span className="block truncate text-xs text-muted">{room.title || invite?.title || 'A YouTube video'}</span>
        </span>
        <button type="button" onClick={() => navigate('/watch')} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent">
          Join
        </button>
        <button type="button" onClick={dismiss} aria-label="Not now" className="rounded-full p-1.5 text-muted hover:bg-surface-2">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
