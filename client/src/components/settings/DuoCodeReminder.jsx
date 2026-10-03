import { useState } from 'react';
import { useNavigate } from 'react-router';
import { KeyRound, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const DISMISS_KEY = 'duo-code-reminder-dismissed';

const wasDismissed = () => {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};

/** Nudges people without a Duo code to set one (needed to answer calls in time). */
export function DuoCodeReminder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(wasDismissed);
  if (hidden || !user || user.hasPin) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Shows again next session; harmless.
    }
    setHidden(true);
  };

  return (
    <div className="mx-auto w-full max-w-3xl animate-fade-in px-3 pt-3">
      <div className="flex items-start gap-3 rounded-3xl border border-line bg-surface p-4 shadow-soft">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <KeyRound size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Set a 4-digit Duo code</p>
          <p className="mt-0.5 text-sm text-muted">Unlock in a second after closing the app, so you can answer calls before they stop ringing.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => navigate('/settings')} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent">
              Set code
            </button>
            <button type="button" onClick={dismiss} className="rounded-full px-4 py-2 text-sm font-semibold text-muted hover:bg-surface-2">
              Not now
            </button>
          </div>
        </div>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="-mt-1 -mr-1 rounded-full p-1.5 text-muted hover:bg-surface-2">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
