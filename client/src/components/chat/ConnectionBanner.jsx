import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { Spinner } from '../common/Spinner';
import { useChatStore } from '../../store/chatStore';

const SHOW_AFTER_MS = 1200;

/** Network / socket state, delayed slightly so quick reconnects don't flicker. */
export function ConnectionBanner() {
  const connection = useChatStore((s) => s.connection);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (connection === 'connected') {
      setVisible(false);
      return undefined;
    }
    const timer = setTimeout(() => setVisible(true), connection === 'offline' ? 0 : SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [connection]);

  if (!visible) return null;
  const offline = connection === 'offline';

  return (
    <div
      role="status"
      className={`flex animate-fade-in items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold ${offline ? 'bg-ink text-canvas' : 'bg-accent-soft text-accent-strong'}`}
    >
      {offline ? <WifiOff size={14} /> : <Spinner size={13} />}
      {offline ? "You're offline — messages will send when you're back" : connection === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
    </div>
  );
}
