import { useState } from 'react';
import { useNavigate } from 'react-router';
import { X } from 'lucide-react';
import { daysBetween, nextOccurrence, todayLocal, useCloseStore } from '../../services/closeActions';

const MILESTONES = new Set([100, 200, 300, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000]);
const ICON = { birthday: '🎂', anniversary: '💞', meetup: '✈️', other: '📅' };
const KEY = 'duo-today-banner-dismissed';

/** On a special day, a small celebration at the top of the chat. */
export function TodayBanner() {
  const navigate = useNavigate();
  const together = useCloseStore((s) => s.together);
  const today = todayLocal();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === today;
    } catch {
      return false;
    }
  });

  const lines = [];
  for (const e of together.events) {
    const days = daysBetween(today, nextOccurrence(e, today));
    if (days === 0) lines.push(`${ICON[e.kind] ?? '📅'} Today: ${e.title}`);
    else if (days === 1) lines.push(`${ICON[e.kind] ?? '📅'} Tomorrow: ${e.title}`);
  }
  if (together.since && together.since <= today) {
    const days = daysBetween(together.since, today);
    const years = Number(today.slice(0, 4)) - Number(together.since.slice(0, 4));
    if (years > 0 && today.slice(5) === together.since.slice(5)) lines.unshift(`💞 ${years} year${years === 1 ? '' : 's'} together today!`);
    else if (MILESTONES.has(days)) lines.unshift(`🎉 ${days} days together today!`);
  }
  if (!lines.length || dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, today);
    } catch {
      // optional
    }
    setDismissed(true);
  };

  return (
    <div className="mx-auto w-full max-w-3xl animate-fade-in px-3 pt-3">
      <div className="flex items-start gap-3 rounded-3xl bg-gradient-to-r from-accent to-accent-strong p-4 text-on-accent shadow-soft">
        <button type="button" onClick={() => navigate('/together')} className="min-w-0 flex-1 text-left">
          {lines.map((line) => (
            <p key={line} className="font-semibold">
              {line}
            </p>
          ))}
        </button>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="-mt-1 -mr-1 rounded-full p-1.5 hover:bg-white/15">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
