import { CircleAlert, Check, X } from 'lucide-react';
import { useToastStore } from '../../store/toastStore';

const TONES = {
  neutral: 'bg-ink text-canvas',
  danger: 'bg-danger text-white',
  success: 'bg-ink text-canvas',
};

export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4"
      style={{ top: 'calc(var(--safe-top) + 12px)' }}
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'danger' ? 'alert' : 'status'}
          className={`pointer-events-auto flex max-w-md animate-pop items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-float ${TONES[t.tone]}`}
        >
          {t.tone === 'danger' ? <CircleAlert size={18} className="shrink-0" /> : t.tone === 'success' ? <Check size={18} className="shrink-0" /> : null}
          <span className="min-w-0 flex-1">{t.message}</span>
          {t.action && (
            <button type="button" className="font-semibold underline-offset-2 hover:underline" onClick={() => { t.action.onClick(); dismiss(t.id); }}>
              {t.action.label}
            </button>
          )}
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="-mr-1 rounded-full p-1 opacity-70 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
