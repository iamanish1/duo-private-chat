import { useState } from 'react';
import { Bell, X } from 'lucide-react';
import { Spinner } from '../common/Spinner';
import { dismissPrompt, useNotifications, wasPromptDismissed } from '../../hooks/useNotifications';
import { toast } from '../../store/toastStore';

const RESULT_MESSAGES = {
  subscribed: "Notifications are on. You'll hear about new messages and calls.",
  'local-only': "Notifications are on while the app is open in the background.",
  denied: 'Notifications are blocked. You can allow them later in your browser settings.',
  private: "Notifications aren't available in private/incognito windows. Open the app in a normal window (or install it) to get them. You'll still hear a chime while this tab is open.",
  unsupported: "This browser doesn't support notifications.",
};

/**
 * Explains the benefit first and only asks the browser for permission after
 * an explicit tap — never on page load.
 */
export function NotificationPrompt({ peerName, visible }) {
  const { state, busy, enable } = useNotifications();
  const [hidden, setHidden] = useState(wasPromptDismissed);

  if (!visible || hidden || state !== 'default') return null;

  const close = () => {
    dismissPrompt();
    setHidden(true);
  };

  const turnOn = async () => {
    try {
      const result = await enable();
      toast.show(RESULT_MESSAGES[result] ?? RESULT_MESSAGES.subscribed, { tone: result === 'denied' || result === 'private' ? 'danger' : 'success', duration: result === 'private' ? 9000 : undefined });
    } catch {
      toast.error("Couldn't turn on notifications. Please try again from Settings.");
    }
    close();
  };

  return (
    <div className="mx-auto w-full max-w-3xl animate-fade-in px-3 pt-3">
      <div className="flex items-start gap-3 rounded-3xl border border-line bg-surface p-4 shadow-soft">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Bell size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Know when {peerName} writes</p>
          <p className="mt-0.5 text-sm text-muted">
            Get a notification for new messages and calls, even when this app is closed. Message text stays hidden unless you choose otherwise.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={turnOn} disabled={busy} className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition hover:bg-accent-strong active:scale-95">
              {busy && <Spinner size={14} />} Turn on
            </button>
            <button type="button" onClick={close} className="rounded-full px-4 py-2 text-sm font-semibold text-muted hover:bg-surface-2">
              Not now
            </button>
          </div>
        </div>
        <button type="button" onClick={close} aria-label="Dismiss" className="-mt-1 -mr-1 rounded-full p-1.5 text-muted hover:bg-surface-2">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
