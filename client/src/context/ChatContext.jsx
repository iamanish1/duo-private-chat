import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from './AuthContext';
import { useRealtime } from '../hooks/useRealtime';
import { loadConversation } from '../services/chatActions';
import { CallLayer } from '../components/calls/CallLayer';
import { StatusViewerHost } from '../components/status/StatusViewer';
import { ProfilePhotoViewerHost } from '../components/common/ProfilePhotoViewer';
import { WatchInviteBanner } from '../components/watch/WatchInviteBanner';
import { ListenEngine } from '../components/music/ListenEngine';
import { ListenInviteBanner } from '../components/music/ListenInviteBanner';

/**
 * Boots the private conversation for the signed-in person: initial load,
 * the realtime connection, and the global call overlay.
 */
export function ChatProvider({ children }) {
  const { endSession } = useAuth();
  const onSessionEnded = useCallback((message) => endSession(message || 'Please sign in again.'), [endSession]);

  useRealtime({ onSessionEnded });
  const navigate = useNavigate();

  // A notification tapped while the app is already open (e.g. a watch invite).
  useEffect(() => {
    const onWorkerMessage = (event) => {
      if (event.data?.type === 'open-url' && typeof event.data.url === 'string' && event.data.url.startsWith('/')) navigate(event.data.url);
    };
    navigator.serviceWorker?.addEventListener('message', onWorkerMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onWorkerMessage);
  }, [navigate]);

  useEffect(() => {
    loadConversation();
  }, []);

  return (
    <>
      {children}
      <StatusViewerHost />
      <ProfilePhotoViewerHost />
      <WatchInviteBanner />
      <ListenInviteBanner />
      <ListenEngine />
      <CallLayer />
    </>
  );
}
