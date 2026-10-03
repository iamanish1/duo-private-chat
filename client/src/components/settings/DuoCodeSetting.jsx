import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { BottomSheet } from '../common/BottomSheet';
import { Spinner } from '../common/Spinner';
import { userApi } from '../../services/api';
import { toast } from '../../store/toastStore';

const digitsOnly = (value) => value.replace(/\D/g, '').slice(0, 4);
const field =
  'h-12 w-full rounded-2xl border border-line bg-surface px-4 text-ink placeholder:text-muted focus:border-accent focus:outline-none';

/** Settings row + sheet to set, change or remove the 4-digit Duo code. */
export function DuoCodeSetting({ user, onUpdated }) {
  const [mode, setMode] = useState(null); // 'set' | 'remove' | null
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const open = (next) => {
    setMode(next);
    setPassword('');
    setPin('');
    setConfirm('');
    setError(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (mode === 'set' && pin.length !== 4) return setError('Choose 4 digits.');
    if (mode === 'set' && pin !== confirm) return setError("The two codes don't match.");
    setBusy(true);
    setError(null);
    try {
      const { user: updated } = mode === 'set' ? await userApi.setPin(password, pin) : await userApi.removePin(password);
      onUpdated(updated);
      toast.success(mode === 'set' ? 'Duo code saved' : 'Duo code removed');
      setMode(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex w-full items-center gap-4 border-b border-line px-4 py-3.5">
        <KeyRound size={20} className="text-muted" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Duo code</span>
          <span className="block text-sm text-muted">
            {user?.hasPin
              ? 'On — unlock with 4 digits after closing the app'
              : 'Off — set one to unlock quickly and answer calls in time'}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <button type="button" onClick={() => open('set')} className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent">
            {user?.hasPin ? 'Change' : 'Set code'}
          </button>
          {user?.hasPin && (
            <button type="button" onClick={() => open('remove')} className="text-xs font-semibold text-danger">
              Remove
            </button>
          )}
        </span>
      </div>

      <BottomSheet open={Boolean(mode)} onClose={() => !busy && setMode(null)} title={mode === 'remove' ? 'Remove Duo code' : 'Set your Duo code'}>
        <form onSubmit={submit} className="flex flex-col gap-3 px-6 pb-2">
          <p className="text-sm text-muted">
            {mode === 'remove'
              ? "You'll need your password each time you reopen the app."
              : 'After closing the app, unlock it with these 4 digits instead of your password. Only you should know it.'}
          </p>
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={field}
            aria-label="Your password"
            required
          />
          {mode === 'set' && (
            <div className="grid grid-cols-2 gap-3">
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                placeholder="New code"
                value={pin}
                onChange={(e) => setPin(digitsOnly(e.target.value))}
                className={`${field} text-center tracking-[0.4em]`}
                aria-label="New 4-digit code"
                required
              />
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Repeat"
                value={confirm}
                onChange={(e) => setConfirm(digitsOnly(e.target.value))}
                className={`${field} text-center tracking-[0.4em]`}
                aria-label="Repeat the code"
                required
              />
            </div>
          )}
          {error && (
            <p className="text-sm font-medium text-danger" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !password}
            className={`mt-1 flex h-12 items-center justify-center gap-2 rounded-full font-semibold text-white disabled:opacity-60 ${mode === 'remove' ? 'bg-danger' : 'bg-accent'}`}
          >
            {busy && <Spinner size={16} />}
            {mode === 'remove' ? 'Remove code' : 'Save code'}
          </button>
        </form>
      </BottomSheet>
    </>
  );
}
