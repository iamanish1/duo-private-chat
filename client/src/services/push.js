import { registerSW } from 'virtual:pwa-register';
import { notificationApi } from './api';

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;
export const pushSupported = () => notificationsSupported() && 'serviceWorker' in navigator && 'PushManager' in window;

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

let registered = false;
export function registerServiceWorker() {
  if (registered || !('serviceWorker' in navigator)) return;
  registered = true;
  registerSW({ immediate: true });
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function readyRegistration() {
  // Avoid hanging forever if the worker failed to install.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Service worker unavailable')), 8000)),
  ]);
}

export async function getPushSubscription() {
  if (!pushSupported()) return null;
  try {
    const registration = await readyRegistration();
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Requests permission (must run from a user gesture), then subscribes this
 * device for Web Push. Returns 'subscribed' | 'local-only' | 'denied' | 'unsupported'.
 */
const PRIVATE_HINT_KEY = 'duo-private-window';

/** Set when the browser refused notifications the way private windows do. */
export function looksLikePrivateWindow() {
  try {
    return sessionStorage.getItem(PRIVATE_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

export async function enableNotifications() {
  if (!notificationsSupported()) return 'unsupported';
  const wasUnasked = Notification.permission === 'default';
  const askedAt = performance.now();
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    // Incognito/private windows refuse instantly, without ever showing a prompt.
    if (wasUnasked && performance.now() - askedAt < 1500) {
      try {
        sessionStorage.setItem(PRIVATE_HINT_KEY, '1');
      } catch {
        // ignore
      }
      return 'private';
    }
    return 'denied';
  }
  if (!pushSupported()) return 'local-only';

  const { enabled, publicKey } = await notificationApi.publicKey();
  if (!enabled) return 'local-only';

  try {
    const registration = await readyRegistration();
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    await notificationApi.subscribe(subscription.toJSON());
    return 'subscribed';
  } catch {
    // Push can be unavailable (private windows, some browsers) even with
    // permission granted; in-tab notifications still work while open.
    return 'local-only';
  }
}

export async function disableNotifications() {
  const subscription = await getPushSubscription();
  if (!subscription) return;
  await notificationApi.unsubscribe(subscription.endpoint).catch(() => {});
  await subscription.unsubscribe().catch(() => {});
}

/** In-tab fallback when push is unavailable: show via the SW (works on Android). */
export async function showLocalNotification(title, options) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    const registration = 'serviceWorker' in navigator ? await readyRegistration() : null;
    if (registration) await registration.showNotification(title, { icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', ...options });
    else new Notification(title, options);
  } catch {
    // Notifications are best-effort.
  }
}
