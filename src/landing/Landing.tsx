import { useEffect, useState } from 'react';
import { ACCOUNT_DELETED_KEY, ACCOUNT_DELETED_NOTICE } from '../sync/deleteAccount';
import { isInAppBrowser, useAuthStore } from '../store/auth';
import { LandingPage } from './LandingPage';

/** Signed-out entry point: the marketing page wired to Google sign-in. */
export function Landing() {
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const error = useAuthStore((s) => s.error);
  const [signingIn, setSigningIn] = useState(false);
  const [inApp] = useState(() => isInAppBrowser());
  // Set by "Delete account" just before its reload; shown once, then forgotten.
  const [deleted] = useState(() => {
    try {
      return sessionStorage.getItem(ACCOUNT_DELETED_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!deleted) return;
    try {
      sessionStorage.removeItem(ACCOUNT_DELETED_KEY);
    } catch {
      /* storage unavailable */
    }
  }, [deleted]);

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

  return (
    <LandingPage
      onSignIn={() => void onSignIn()}
      signingIn={signingIn}
      error={shown}
      notice={deleted ? ACCOUNT_DELETED_NOTICE : null}
    />
  );
}
