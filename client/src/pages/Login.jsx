import { useState } from 'react';
import { CircleAlert, Eye, EyeOff, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Spinner } from '../components/common/Spinner';
import { APP_NAME } from '../config';

export default function Login() {
  const { login, notice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  const field =
    'h-13 w-full rounded-2xl border border-line bg-surface px-4 text-ink shadow-soft transition placeholder:text-muted focus:border-accent focus:ring-4 focus:ring-accent/15 focus:outline-none';

  return (
    <div className="chat-backdrop scroll-area h-full">
      <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-6 pt-[calc(var(--safe-top)+32px)] pb-[calc(var(--safe-bottom)+32px)]">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="relative mb-6 flex h-16 w-24 items-center justify-center" aria-hidden="true">
            <span className="absolute left-1 size-14 rounded-full border-[6px] border-accent" />
            <span className="absolute right-1 size-14 rounded-full border-[6px] border-accent/45" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{APP_NAME}</h1>
          <p className="mt-2 text-muted">A private space for two.</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
          {(error || notice) && (
            <div role="alert" className={`flex items-start gap-2 rounded-2xl px-4 py-3 text-sm ${error ? 'bg-danger/10 text-danger' : 'bg-accent-soft text-accent-strong'}`}>
              <CircleAlert size={18} className="mt-px shrink-0" />
              <span>{error || notice}</span>
            </div>
          )}

          <label className="sr-only" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
            required
          />

          <label className="sr-only" htmlFor="password">Password</label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${field} pr-12`}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-surface-2"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </div>

          <button
            type="submit"
            disabled={submitting || !email || !password}
            className="mt-3 flex h-13 items-center justify-center gap-2 rounded-2xl bg-accent font-semibold text-on-accent shadow-soft transition hover:bg-accent-strong active:scale-[0.98] disabled:opacity-60"
          >
            {submitting && <Spinner size={18} />}
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-10 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
          <Lock size={13} /> Invitation only. There is no sign-up.
        </p>
      </main>
    </div>
  );
}
