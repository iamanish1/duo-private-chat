import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, onSessionLost } from '../services/api';
import { disconnectSocket } from '../services/socket';
import { disableNotifications } from '../services/push';
import { clearSongCache } from '../services/songCache';
import { useChatStore } from '../store/chatStore';
import { useCallStore } from '../store/callStore';

const AuthContext = createContext(null);

// sessionStorage lives exactly as long as this tab / installed-app window: it
// survives reloads but is cleared when the window is closed. Its absence on
// startup means the app was closed and reopened, so we require a fresh login.
const OPEN_SESSION_KEY = 'duo-session-open';
const openSession = {
  has() {
    try {
      return sessionStorage.getItem(OPEN_SESSION_KEY) === '1';
    } catch {
      return false;
    }
  },
  set(open) {
    try {
      if (open) sessionStorage.setItem(OPEN_SESSION_KEY, '1');
      else sessionStorage.removeItem(OPEN_SESSION_KEY);
    } catch {
      // Without storage every start simply asks for the password.
    }
  },
};

export function AuthProvider({ children }) {
  // status: loading | locked | authenticated | anonymous | unreachable
  const [state, setState] = useState({ status: 'loading', user: null, notice: null, lock: null });

  /** Trusted device with a Duo code → lock screen; otherwise the password screen. */
  const showLockOrLogin = useCallback(async (notice = null) => {
    try {
      const lock = await authApi.lockStatus();
      if (lock.locked && lock.hasPin && !lock.pinLocked) {
        setState({ status: 'locked', user: null, notice, lock });
        return;
      }
      const lockedOut = lock.locked && lock.pinLocked ? 'Too many wrong codes. Sign in with your password.' : null;
      setState({ status: 'anonymous', user: null, notice: lockedOut ?? notice, lock: null });
    } catch (err) {
      setState({ status: err.status ? 'anonymous' : 'unreachable', user: null, notice, lock: null });
    }
  }, []);

  const checkSession = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }));
    if (!openSession.has()) {
      // Reopened after being closed: end the session (the device stays trusted)
      // and ask for the Duo code, or the password if there is none.
      await authApi.lock().catch(() => {});
      await showLockOrLogin();
      return;
    }
    try {
      const { user } = await authApi.me();
      setState({ status: 'authenticated', user, notice: null, lock: null });
    } catch (err) {
      if (err.status) await showLockOrLogin();
      else setState({ status: 'unreachable', user: null, notice: null, lock: null });
    }
  }, [showLockOrLogin]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const endSession = useCallback(
    (notice = null) => {
      openSession.set(false);
      disconnectSocket();
      useChatStore.getState().reset();
      useCallStore.getState().reset();
      setState({ status: 'loading', user: null, notice: null, lock: null });
      showLockOrLogin(notice);
    },
    [showLockOrLogin],
  );

  // Any 401 from the API (expired/revoked token) lands the user on login.
  useEffect(
    () =>
      onSessionLost((err) =>
        endSession(err.code === 'SESSION_EXPIRED' ? 'Your session expired. Please sign in again.' : 'Please sign in again.'),
      ),
    [endSession],
  );

  const value = useMemo(
    () => ({
      ...state,
      async login(email, password) {
        const { user } = await authApi.login(email, password);
        openSession.set(true);
        setState({ status: 'authenticated', user, notice: null, lock: null });
      },
      /** Unlock this trusted device with the 4-digit Duo code. */
      async unlock(pin) {
        const { user } = await authApi.unlock(pin);
        openSession.set(true);
        setState({ status: 'authenticated', user, notice: null, lock: null });
      },
      /** From the lock screen: forgot the code → full password sign-in. */
      usePassword: () => setState((s) => ({ ...s, status: 'anonymous', notice: null, lock: null })),
      async logout({ everywhere = false } = {}) {
        // Don't keep pushing to a device someone signed out of.
        await disableNotifications({ optOut: false }).catch(() => {});
        await (everywhere ? authApi.logoutEverywhere() : authApi.logout()).catch(() => {});
        await clearSongCache();
        endSession(null);
      },
      endSession,
      retry: checkSession,
      updateUser: (user) => setState((s) => ({ ...s, user: { ...s.user, ...user } })),
    }),
    [state, endSession, checkSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
