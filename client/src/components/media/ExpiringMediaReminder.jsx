import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Clock, X } from 'lucide-react';
import { chatApi } from '../../services/api';
import { formatDate } from '../../utils/format';

const DISMISS_KEY = 'duo-expiring-reminder-until';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

const snoozed = () => {
  try {
    return Number(localStorage.getItem(DISMISS_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
};

/**
 * 30 days before old videos are removed (2-year clean-up), a gentle heads-up
 * in the chat: review them and tap "Keep forever" on the ones you love.
 */
export function ExpiringMediaReminder() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [hidden, setHidden] = useState(snoozed);

  useEffect(() => {
    if (hidden) return undefined;
    let active = true;
    chatApi
      .expiring()
      .then(({ messages }) => active && setItems(messages))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [hidden]);

  if (hidden || !items.length) return null;
  const first = items[0];

  const snooze = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + SNOOZE_MS));
    } catch {
      // Shows again next time; harmless.
    }
    setHidden(true);
  };

  return (
    <div className="mx-auto w-full max-w-3xl animate-fade-in px-3 pt-3">
      <div className="flex items-start gap-3 rounded-3xl border border-line bg-surface p-4 shadow-soft">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Clock size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {items.length === 1 ? 'An old video will be removed soon' : `${items.length} old videos will be removed soon`}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            Videos are removed 2 years after they were sent, to keep Duo free. The first goes on {formatDate(first.mediaRemovesAt)} — keep the ones you love.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => navigate('/media?show=expiring')} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent">
              Review
            </button>
            <button type="button" onClick={snooze} className="rounded-full px-4 py-2 text-sm font-semibold text-muted hover:bg-surface-2">
              Later
            </button>
          </div>
        </div>
        <button type="button" onClick={snooze} aria-label="Dismiss" className="-mt-1 -mr-1 rounded-full p-1.5 text-muted hover:bg-surface-2">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
