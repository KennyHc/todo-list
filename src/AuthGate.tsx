import { lazy, Suspense, useEffect } from 'react';
import { Splash } from './components/Splash';
import { Landing } from './landing/Landing';
import { hasAuthHint, useAuthStore } from './store/auth';

/**
 * The app, cloud sync and Firestore load as one lazy chunk, so signed-out visitors only
 * download the landing page and the auth SDK.
 */
const loadSignedIn = () => import('./SignedIn');
const SignedIn = lazy(loadSignedIn);

// A returning user (or one coming back from the redirect flow) is probably signed in: fetch the
// app in parallel with session restoration instead of after it.
if (hasAuthHint()) void loadSignedIn();

/**
 * Sign-in is required. While Firebase restores the session, returning users (auth-hint) see the
 * splash instead of a landing-page flash; first-time visitors see the landing page straight away.
 * The splash also covers the lazy chunk and the first sync (SignedIn renders it for the latter).
 */
export function AuthGate() {
  const status = useAuthStore((s) => s.status);
  useEffect(() => {
    if (status === 'signedIn') void loadSignedIn();
  }, [status]);

  if (status === 'loading') return hasAuthHint() ? <Splash /> : <Landing />;
  if (status === 'signedOut') return <Landing />;
  return (
    <Suspense fallback={<Splash />}>
      <SignedIn />
    </Suspense>
  );
}
