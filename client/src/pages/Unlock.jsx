import { useCallback, useEffect, useState } from 'react';
import { Delete, Phone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Avatar } from '../components/common/Avatar';
import { Spinner } from '../components/common/Spinner';
import { getCallLaunch } from '../services/callController';

const LENGTH = 4;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

/** Lock screen after the app was reopened: 4-digit Duo code, or the password. */
export default function Unlock() {
  const { lock, notice, unlock, usePassword } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState(notice);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [call] = useState(getCallLaunch);

  const submit = useCallback(
    async (pin) => {
      setBusy(true);
      setError(null);
      try {
        await unlock(pin);
      } catch (err) {
        setCode('');
        setBusy(false);
        setShake(true);
        setTimeout(() => setShake(false), 450);
        navigator.vibrate?.(120);
        if (err.code === 'PIN_LOCKED' || err.code === 'PIN_NOT_SET') {
          usePassword();
          return;
        }
        setError(err.message);
      }
    },
    [unlock, usePassword],
  );

  const press = useCallback(
    (key) => {
      if (busy) return;
      if (key === 'back') {
        setCode(code.slice(0, -1));
        return;
      }
      if (code.length >= LENGTH) return;
      const next = code + key;
      setCode(next);
      if (next.length === LENGTH) submit(next);
    },
    [busy, code, submit],
  );

  // Physical keyboards (laptops) can type the code too.
  useEffect(() => {
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  const firstName = lock?.user?.name?.split(' ')[0] ?? '';

  return (
    <div className="chat-backdrop scroll-area h-full">
      <main className="mx-auto flex min-h-full w-full max-w-sm flex-col items-center justify-center px-6 pt-[calc(var(--safe-top)+24px)] pb-[calc(var(--safe-bottom)+24px)]">
        {call && (
          <div className="mb-6 flex w-full animate-pop items-center gap-3 rounded-2xl bg-online/15 px-4 py-3 text-sm font-medium text-ink" role="status">
            <span className="flex size-9 shrink-0 animate-pulse items-center justify-center rounded-full bg-online text-white">
              <Phone size={17} />
            </span>
            <span>
              {lock?.peerName ?? 'Someone'} is calling — enter your code to {call.answer ? 'answer' : 'see the call'}
            </span>
          </div>
        )}

        <Avatar user={lock?.user} size="lg" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Welcome back{firstName ? `, ${firstName}` : ''}</h1>
        <p className="mt-1 text-sm text-muted">Enter your Duo code</p>

        <div className={`mt-7 flex gap-4 ${shake ? 'animate-shake' : ''}`} aria-label={`${code.length} of ${LENGTH} digits entered`}>
          {Array.from({ length: LENGTH }, (_, i) => (
            <span
              key={i}
              className={`size-4 rounded-full border-2 transition ${i < code.length ? 'scale-110 border-accent bg-accent' : 'border-muted/50'}`}
            />
          ))}
        </div>

        <p className="mt-4 h-5 text-sm font-medium text-danger" role="alert">
          {busy ? <Spinner size={16} className="text-muted" /> : error}
        </p>

        <div className="mt-4 grid w-full max-w-[280px] grid-cols-3 gap-4">
          {KEYS.map((key, i) =>
            key === '' ? (
              <span key={i} />
            ) : (
              <button
                key={i}
                type="button"
                onClick={() => press(key)}
                disabled={busy}
                aria-label={key === 'back' ? 'Delete' : key}
                className="flex aspect-square items-center justify-center rounded-full bg-surface text-2xl font-semibold text-ink shadow-soft transition select-none active:scale-90 active:bg-surface-2 disabled:opacity-50"
              >
                {key === 'back' ? <Delete size={24} /> : key}
              </button>
            ),
          )}
        </div>

        <button type="button" onClick={usePassword} className="mt-8 text-sm font-semibold text-accent hover:underline">
          Forgot code? Use password
        </button>
      </main>
    </div>
  );
}
