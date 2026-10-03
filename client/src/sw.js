/* eslint-env serviceworker */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { clientsClaim } from 'workbox-core';

self.skipWaiting();
clientsClaim();

// App shell only. Messages and media are deliberately never cached by the
// service worker: this is a private app and devices can be shared or lost.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

try {
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL('index.html'), {
      denylist: [/^\/api\//, /^\/socket\.io\//],
    }),
  );
} catch {
  // In development the shell is not precached; the dev server handles navigation.
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const watching = windows.some((client) => client.focused && client.visibilityState === 'visible');
      // The open, focused app already shows the message in real time.
      if (watching && data.type === 'message') return;

      await self.registration.showNotification(data.title || 'New message', {
        body: data.body || '',
        tag: data.tag || 'duo',
        renotify: true,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        requireInteraction: Boolean(data.requireInteraction),
        vibrate: data.type === 'call' ? [300, 150, 300, 150, 300] : [80, 40, 80],
        data: { url: data.url || '/' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
