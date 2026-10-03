import { useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useRealtime } from '../hooks/useRealtime';
import { loadConversation } from '../services/chatActions';
import { CallLayer } from '../components/calls/CallLayer';

/**
 * Boots the private conversation for the signed-in person: initial load,
 * the realtime connection, and the global call overlay.
 */
export function ChatProvider({ children }) {
  const { endSession } = useAuth();
  const onSessionEnded = useCallback((message) => endSession(message || 'Please sign in again.'), [endSession]);

  useRealtime({ onSessionEnded });

  useEffect(() => {
    loadConversation();
  }, []);

  return (
    <>
      {children}
      <CallLayer />
    </>
  );
}
