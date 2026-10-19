import { useState } from 'react';
import { isInAppBrowser, useAuthStore } from '../store/auth';
import { LandingPage } from './LandingPage';

/** Signed-out entry point: the marketing page wired to Google sign-in. */
export function Landing() {
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const error = useAuthStore((s) => s.error);
  const [signingIn, setSigningIn] = useState(false);
  const [inApp] = useState(() => isInAppBrowser());

  const onSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } finally {
      // On success the gate unmounts this page; on cancel or error the buttons re-enable.
      setSigningIn(false);
    }
  };

  const shown =
    error ??
    (inApp
      ? 'Google sign-in is blocked inside in-app browsers. Open this page in Safari or Chrome (⋯ → Open in browser).'
      : null);

  return <LandingPage onSignIn={() => void onSignIn()} signingIn={signingIn} error={shown} />;
}
