import { EllipsisVertical, Phone, Popcorn, Video } from 'lucide-react';
import { PeerAvatar } from './PeerAvatar';
import { IconButton } from '../common/IconButton';
import { useChatStore } from '../../store/chatStore';
import { useNow } from '../../hooks/useNow';
import { formatLastSeen } from '../../utils/format';

export function PresenceLine({ peer, typing, now }) {
  if (typing) {
    return <span className="font-medium text-accent">typing…</span>;
  }
  if (peer?.isOnline) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-online" aria-hidden="true" />
        Online
      </span>
    );
  }
  return <span>{formatLastSeen(peer?.lastSeen, now)}</span>;
}

export function ChatHeader({ onCall, onMenu, onProfile, onWatch, callDisabled }) {
  // onCall(kind): 'audio' (voice) or 'video'.
  const peer = useChatStore((s) => s.peer);
  const typing = useChatStore((s) => s.peerTyping);
  const now = useNow();

  return (
    <header className="glass relative z-20 border-b border-line pt-safe">
      <div className="mx-auto flex h-16 max-w-3xl items-center gap-1 pr-1 pl-2">
        <PeerAvatar size="md" className="ml-1" />
        <button type="button" onClick={onProfile} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-1.5 text-left transition hover:bg-surface-2/70 lg:pointer-events-none" aria-label={`About ${peer?.name ?? 'chat'}`}>
          <span className="min-w-0">
            <span className="block truncate text-[16px] leading-tight font-semibold">{peer?.name ?? ' '}</span>
            <span className="block truncate text-[13px] text-muted" aria-live="polite">
              <PresenceLine peer={peer} typing={typing} now={now} />
            </span>
          </span>
        </button>
        <IconButton label="Watch together" onClick={onWatch}>
          <Popcorn size={21} />
        </IconButton>
        <IconButton label={`Voice call ${peer?.name ?? ''}`} onClick={() => onCall('audio')} disabled={callDisabled}>
          <Phone size={21} />
        </IconButton>
        <IconButton label={`Video call ${peer?.name ?? ''}`} onClick={() => onCall('video')} disabled={callDisabled}>
          <Video size={23} />
        </IconButton>
        <IconButton label="Menu" onClick={onMenu} className="lg:hidden">
          <EllipsisVertical size={22} />
        </IconButton>
      </div>
    </header>
  );
}
