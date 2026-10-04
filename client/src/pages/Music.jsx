import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Headphones, ListMusic, MessageCircle, Music2 } from 'lucide-react';
import { IconButton } from '../components/common/IconButton';
import { NowPlayingPanel } from '../components/music/NowPlayingPanel';
import { SongsPanel } from '../components/music/SongsPanel';
import { PlaylistsPanel } from '../components/music/PlaylistsPanel';
import { WatchChat } from '../components/watch/WatchChat';
import { useMusicStore } from '../store/musicStore';
import { useChatStore } from '../store/chatStore';

const TABS = [
  { id: 'now', label: 'Playing', icon: Headphones },
  { id: 'songs', label: 'Songs', icon: Music2 },
  { id: 'playlists', label: 'Playlists', icon: ListMusic },
  { id: 'chat', label: 'Chat', icon: MessageCircle, phoneOnly: true },
];

export default function MusicPage() {
  const navigate = useNavigate();
  const joined = useMusicStore((s) => s.joined);
  const room = useMusicStore((s) => s.room);
  const peer = useChatStore((s) => s.peer);
  const [tab, setTab] = useState(() => (useMusicStore.getState().joined ? 'now' : 'songs'));
  const together = joined && room?.members.includes(peer?.id);
  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/', { replace: true }));

  return (
    <div className="flex h-full flex-col bg-canvas lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="glass relative z-20 border-b border-line pt-safe">
          <div className="flex h-14 items-center gap-1 px-2">
            <IconButton label="Back" onClick={goBack}>
              <ArrowLeft size={22} />
            </IconButton>
            <div className="min-w-0 flex-1 px-1 leading-tight">
              <h1 className="truncate text-[16px] font-semibold">Listen together</h1>
              <p className="truncate text-xs text-muted">{together ? `Listening with ${peer.name} 🎧` : joined ? `Waiting for ${peer?.name ?? 'them'}` : 'Your shared music'}</p>
            </div>
          </div>
          <nav className="flex px-2" role="tablist" aria-label="Music">
            {TABS.map(({ id, label, icon: Icon, phoneOnly }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-sm font-semibold transition ${phoneOnly ? 'lg:hidden' : ''} ${
                  tab === id ? 'border-accent text-accent-strong' : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </nav>
        </header>
        <main className={`min-h-0 flex-1 ${tab === 'chat' ? 'flex flex-col lg:hidden' : 'scroll-area'}`}>
          {tab === 'now' && <NowPlayingPanel />}
          {tab === 'songs' && <SongsPanel />}
          {tab === 'playlists' && <PlaylistsPanel />}
          {tab === 'chat' && <WatchChat emptyText="Talk about the music 🎶" />}
        </main>
      </div>
      <aside className="hidden min-h-0 flex-col border-l border-line bg-surface lg:flex lg:w-96">
        <WatchChat emptyText="Talk about the music 🎶" />
      </aside>
    </div>
  );
}
