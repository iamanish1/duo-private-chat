import { useEffect, useState } from 'react';
import { CircleDashed, Headphones, History, Images, Phone, Popcorn, Search, Settings, ShieldCheck, UserRound, Video } from 'lucide-react';
import { Link } from 'react-router';
import { PresenceLine } from './ChatHeader';
import { PeerAvatar } from './PeerAvatar';
import { useChatStore } from '../../store/chatStore';
import { useNow } from '../../hooks/useNow';
import { chatApi } from '../../services/api';
import { resolveUrl } from '../../utils/url';

const LINKS = [
  { to: '/watch', icon: Popcorn, label: 'Watch together' },
  { to: '/music', icon: Headphones, label: 'Listen together' },
  { to: '/status', icon: CircleDashed, label: 'Status' },
  { to: '/media', icon: Images, label: 'Photos & videos' },
  { to: '/search', icon: Search, label: 'Search messages' },
  { to: '/calls', icon: History, label: 'Call history' },
  { to: '/settings', icon: UserRound, label: 'Your profile' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

/** Wide screens only: profile, shortcuts and recent media beside the chat. */
export function ChatSidebar({ onCall, onOpenMedia, callDisabled }) {
  const peer = useChatStore((s) => s.peer);
  const typing = useChatStore((s) => s.peerTyping);
  const mediaCount = useChatStore((s) => s.messages.filter((m) => m.type !== 'text' && m.id && !m.deleted).length);
  const now = useNow();
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    let active = true;
    chatApi.media({}).then(({ messages }) => active && setRecent(messages.slice(0, 9))).catch(() => {});
    return () => {
      active = false;
    };
  }, [mediaCount]);

  return (
    <aside className="hidden w-80 shrink-0 flex-col border-r border-line bg-surface lg:flex xl:w-96">
      <div className="scroll-area flex-1 px-5 pt-safe">
        <div className="flex flex-col items-center pt-10 pb-6 text-center">
          <PeerAvatar size="xl" />
          <h2 className="mt-4 text-xl font-semibold">{peer?.name}</h2>
          <p className="mt-1 text-sm text-muted">
            <PresenceLine peer={peer} typing={typing} now={now} />
          </p>
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => onCall('audio')} disabled={callDisabled} className="flex items-center gap-2 rounded-full bg-surface-2 px-5 py-2.5 text-sm font-semibold text-ink shadow-soft transition hover:brightness-95 disabled:opacity-50">
              <Phone size={17} /> Voice call
            </button>
            <button type="button" onClick={() => onCall('video')} disabled={callDisabled} className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent shadow-soft transition hover:bg-accent-strong disabled:opacity-50">
              <Video size={18} /> Video call
            </button>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {LINKS.map(({ to, icon: Icon, label }) => (
            <Link key={label} to={to} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 font-medium transition hover:bg-surface-2">
              <Icon size={19} className="text-muted" /> {label}
            </Link>
          ))}
        </nav>

        {recent.length > 0 && (
          <section className="mt-6">
            <h3 className="px-1 pb-2 text-xs font-semibold tracking-wide text-muted uppercase">Recently shared</h3>
            <div className="grid grid-cols-3 gap-1.5">
              {recent.map((m) => (
                <button key={m.id} type="button" onClick={() => onOpenMedia(m)} className="aspect-square overflow-hidden rounded-xl bg-surface-2" aria-label="Open media">
                  {m.media?.thumbnailUrl && <img src={resolveUrl(m.media.thumbnailUrl)} alt="" loading="lazy" className="size-full object-cover" />}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
      <p className="flex items-center justify-center gap-1.5 border-t border-line px-5 py-4 text-xs text-muted">
        <ShieldCheck size={14} /> Private to the two of you
      </p>
    </aside>
  );
}
