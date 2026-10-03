import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, onSessionLost } from '../services/api';
import { disconnectSocket } from '../services/socket';
import { disableNotifications } from '../services/push';
import { useChatStore } from '../store/chatStore';
import { useCallStore } from '../store/callStore';

const AuthContext = createContext(null);

// status: loading | authenticated | anonymous | unreachable
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, notice: null });

  const checkSession = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }));
    try {
      const { user } = await authApi.me();
      setState({ status: 'authenticated', user, notice: null });
    } catch (err) {
      setState({ status: err.status ? 'anonymous' : 'unreachable', user: null, notice: null });
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const endSession = useCallback((notice = null) => {
    disconnectSocket();
    useChatStore.getState().reset();
    useCallStore.getState().reset();
    setState({ status: 'anonymous', user: null, notice });
  }, []);

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
        setState({ status: 'authenticated', user, notice: null });
      },
      async logout({ everywhere = false } = {}) {
        // Don't keep pushing to a device someone signed out of.
        await disableNotifications().catch(() => {});
        await (everywhere ? authApi.logoutEverywhere() : authApi.logout()).catch(() => {});
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
