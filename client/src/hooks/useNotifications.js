import { useCallback, useEffect, useState } from 'react';
import {
  disableNotifications,
  enableNotifications,
  getPushSubscription,
  isIOS,
  isStandalone,
  looksLikePrivateWindow,
  notificationsSupported,
  pushSupported,
} from '../services/push';

const DISMISS_KEY = 'duo-notify-prompt-dismissed';

/**
 * Notification permission + push subscription state for this device.
 * `state`: unsupported | needs-install | default | denied | private | enabled | local-only
 */
export function useNotifications() {
  const [state, setState] = useState('default');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!notificationsSupported()) {
      // iOS only exposes Web Push to installed (home screen) web apps.
      setState(isIOS() && !isStandalone() ? 'needs-install' : 'unsupported');
      return;
    }
    if (Notification.permission === 'denied') return setState(looksLikePrivateWindow() ? 'private' : 'denied');
    if (Notification.permission === 'default') return setState('default');
    const subscription = pushSupported() ? await getPushSubscription() : null;
    setState(subscription ? 'enabled' : 'local-only');
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const result = await enableNotifications();
      await refresh();
      return result;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      await disableNotifications();
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  return { state, busy, enable, disable, refresh };
}

export function wasPromptDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissPrompt() {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // Ignore: the prompt simply reappears next session.
  }
}
