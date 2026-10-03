import { useEffect } from 'react';
import { getSocket } from '../services/socket';
import { callSocketHandlers, endCallOnPageHide } from '../services/callController';

/** Binds call signaling events for the lifetime of the authenticated app. */
export function useWebRTC() {
  useEffect(() => {
    const socket = getSocket();
    Object.entries(callSocketHandlers).forEach(([event, fn]) => socket.on(event, fn));
    window.addEventListener('pagehide', endCallOnPageHide);
    return () => {
      Object.entries(callSocketHandlers).forEach(([event, fn]) => socket.off(event, fn));
      window.removeEventListener('pagehide', endCallOnPageHide);
    };
  }, []);
}
