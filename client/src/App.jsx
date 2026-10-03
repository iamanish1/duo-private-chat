import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';
import { WifiOff } from 'lucide-react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ChatProvider } from './context/ChatContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { StateScreen } from './components/common/StateScreen';
import { Spinner } from './components/common/Spinner';
import { Toaster } from './components/common/Toaster';
import { useVisualViewport } from './hooks/useVisualViewport';
import Login from './pages/Login';
import Chat from './pages/Chat';

// Secondary screens are code-split to keep the first load small on mobile.
const Media = lazy(() => import('./pages/Media'));
const Search = lazy(() => import('./pages/Search'));
const Calls = lazy(() => import('./pages/Calls'));
const Settings = lazy(() => import('./pages/Settings'));

function Splash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <div className="relative flex h-16 w-24 items-center justify-center" aria-hidden="true">
        <span className="absolute left-1 size-14 animate-pulse rounded-full border-[6px] border-accent" />
        <span className="absolute right-1 size-14 animate-pulse rounded-full border-[6px] border-accent/45 [animation-delay:300ms]" />
      </div>
      <Spinner className="text-muted" />
    </div>
  );
}

function RequireAuth() {
  const { status } = useAuth();
  if (status !== 'authenticated') return <Navigate to="/login" replace />;
  return (
    <ChatProvider>
      <Suspense fallback={<Splash />}>
        <Outlet />
      </Suspense>
    </ChatProvider>
  );
}

function AppRoutes() {
  const { status, retry } = useAuth();
  if (status === 'loading') return <Splash />;
  if (status === 'unreachable') {
    return (
      <StateScreen
        icon={WifiOff}
        title="Can't connect"
        description="Check your internet connection. Your messages will be here when you're back online."
        action={{ label: 'Try again', onClick: retry }}
      />
    );
  }
  return (
    <Routes>
      <Route path="/login" element={status === 'authenticated' ? <Navigate to="/" replace /> : <Login />} />
      <Route element={<RequireAuth />}>
        <Route index element={<Chat />} />
        <Route path="media" element={<Media />} />
        <Route path="search" element={<Search />} />
        <Route path="calls" element={<Calls />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  useVisualViewport();
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <div className="app-shell overflow-hidden">
              <AppRoutes />
            </div>
          </BrowserRouter>
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
