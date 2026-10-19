import App from './App';
import { Splash } from './components/Splash';
import { Landing } from './landing/Landing';
import { hasAuthHint, useAuthStore } from './store/auth';
import { useCloudSync } from './sync/useCloudSync';
import { useSyncStore } from './sync/status';

/**
 * Sign-in is required. While Firebase restores the session, returning users (auth-hint) see the
 * splash instead of a landing-page flash; first-time visitors see the landing page straight away.
 */
export function AuthGate() {
  const status = useAuthStore((s) => s.status);
  const syncStatus = useSyncStore((s) => s.syncStatus);
  useCloudSync();

  if (status === 'loading') return hasAuthHint() ? <Splash /> : <Landing />;
  if (status === 'signedOut') return <Landing />;
  if (syncStatus === 'loading') return <Splash />;
  return <App />;
}
