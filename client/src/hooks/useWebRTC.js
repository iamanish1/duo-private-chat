import { useEffect } from 'react';
import { getSocket } from '../services/socket';
import { answerWhenRinging, callSocketHandlers, endCallOnPageHide } from '../services/callController';

/** Binds call signaling events for the lifetime of the authenticated app. */
export function useWebRTC() {
  useEffect(() => {
    const socket = getSocket();
    Object.entries(callSocketHandlers).forEach(([event, fn]) => socket.on(event, fn));
    window.addEventListener('pagehide', endCallOnPageHide);
    // "Answer" on a call notification while the app is already open.
    const onWorkerMessage = (event) => {
      if (event.data?.type === 'call-notification' && event.data.answer) answerWhenRinging(event.data.callId);
    };
    navigator.serviceWorker?.addEventListener('message', onWorkerMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', onWorkerMessage);
      Object.entries(callSocketHandlers).forEach(([event, fn]) => socket.off(event, fn));
      window.removeEventListener('pagehide', endCallOnPageHide);
    };
  }, []);
}
