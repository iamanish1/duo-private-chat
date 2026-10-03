import { useEffect } from 'react';
import { getSocket } from '../services/socket';
import { acknowledgeDelivered, flushOutbox, markSeen, syncNewer } from '../services/chatActions';
import { ensurePushSubscription, getPushEndpoint, onPushEndpointChange, showLocalNotification } from '../services/push';
import { useChatStore } from '../store/chatStore';
import { APP_NAME } from '../config';
import { playMessageChime } from '../utils/sounds';

const TYPING_TIMEOUT_MS = 6000;
const store = () => useChatStore.getState();

/**
 * Owns the socket lifecycle for the signed-in session and mirrors server
 * events into the chat store. Mounted once, inside the authenticated app.
 */
export function useRealtime({ onSessionEnded }) {
  useEffect(() => {
    const socket = getSocket();
    let typingTimer;
    let hiddenUnread = 0;
    let pushEndpoint = getPushEndpoint();
    let pushChecked = false;

    const reportVisibility = () => {
      const visible = document.visibilityState === 'visible';
      // The endpoint tells the server which push registration is this device.
      if (socket.connected) socket.emit('presence:visibility', { visible, endpoint: pushEndpoint });
      if (visible) {
        hiddenUnread = 0;
        document.title = APP_NAME;
        markSeen();
      }
    };

    const notifyIfHidden = (message) => {
      if (document.visibilityState === 'visible') return;
      hiddenUnread += 1;
      document.title = `(${hiddenUnread}) ${APP_NAME}`;
      // With Web Push active the server notifies this device instead.
      if (pushEndpoint) return;
      // Works even where notifications can't (e.g. incognito windows).
      playMessageChime();
      const { peer } = store();
      showLocalNotification(peer?.name || 'New message', {
        body: `Sent you ${{ text: 'a message', image: 'a photo', video: 'a video', audio: 'a voice message' }[message.type] ?? 'a message'}`,
        tag: 'duo-messages',
        renotify: true,
        data: { url: '/' },
      });
    };

    const handlers = {
      connect: () => {
        store().setConnection('connected');
        reportVisibility();
        if (!pushChecked) {
          pushChecked = true;
          // Repair/refresh this device's push registration (never prompts).
          ensurePushSubscription();
        }
        syncNewer();
        flushOutbox();
      },
      disconnect: (reason) => {
        store().setPeerTyping(false);
        store().setConnection(navigator.onLine ? 'reconnecting' : 'offline');
        // Server-initiated disconnects don't auto-retry; reconnect and let auth decide.
        if (reason === 'io server disconnect') socket.connect();
      },
      connect_error: (err) => {
        if (err.message === 'unauthorized') onSessionEnded(err.data?.message);
        else store().setConnection(navigator.onLine ? 'reconnecting' : 'offline');
      },
      'message:new': (message) => {
        store().upsert(message);
        if (message.senderId === store().me?.id) return;
        store().setPeerTyping(false);
        acknowledgeDelivered([message]);
        markSeen();
        notifyIfHidden(message);
      },
      'message:status': (payload) => store().applyStatus(payload),
      'message:updated': (message) => store().upsert(message),
      'typing:start': () => {
        store().setPeerTyping(true);
        clearTimeout(typingTimer);
        // Self-heal if a stop event is ever lost.
        typingTimer = setTimeout(() => store().setPeerTyping(false), TYPING_TIMEOUT_MS);
      },
      'typing:stop': () => {
        clearTimeout(typingTimer);
        store().setPeerTyping(false);
      },
      'user:online': () => store().setPeer({ isOnline: true }),
      'user:offline': ({ lastSeen }) => {
        store().setPeer({ isOnline: false, lastSeen });
        store().setPeerTyping(false);
      },
      'presence:state': ({ peer }) => store().setPeer(peer),
      'user:updated': (user) => (user.id === store().peer?.id ? store().setPeer(user) : store().setMe(user)),
      'session:revoked': () => onSessionEnded('You were signed out on all devices.'),
      'session:expired': () => onSessionEnded('Your session expired. Please sign in again.'),
    };

    const onOnline = () => {
      // The socket may have survived a brief offline blip; just clear the banner.
      if (socket.connected) store().setConnection('connected');
      else socket.connect();
    };
    const onOffline = () => store().setConnection('offline');

    Object.entries(handlers).forEach(([event, fn]) => socket.on(event, fn));
    const stopEndpointWatch = onPushEndpointChange((endpoint) => {
      pushEndpoint = endpoint;
      reportVisibility();
    });
    // Mobile browsers may freeze a backgrounded page before visibilitychange
    // reaches the server; say "hidden" on these too so pushes aren't skipped.
    const reportHidden = () => socket.connected && socket.emit('presence:visibility', { visible: false, endpoint: pushEndpoint });
    document.addEventListener('visibilitychange', reportVisibility);
    window.addEventListener('pagehide', reportHidden);
    document.addEventListener('freeze', reportHidden);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    socket.connect();

    return () => {
      clearTimeout(typingTimer);
      Object.entries(handlers).forEach(([event, fn]) => socket.off(event, fn));
      document.removeEventListener('visibilitychange', reportVisibility);
      window.removeEventListener('pagehide', reportHidden);
      document.removeEventListener('freeze', reportHidden);
      stopEndpointWatch();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      socket.disconnect();
      document.title = APP_NAME;
    };
  }, [onSessionEnded]);
}
