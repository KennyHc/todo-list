import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { create } from 'zustand';
import { auth, googleProvider, popupRedirect } from '../lib/firebase';
import { clearDeletePending, isDeletePending } from '../sync/deletePending';
import { flushActiveSync, stopActiveSync } from '../sync/syncControl';
import { resetTaskStore } from './tasks';
import { useUIStore } from './ui';

export type AuthUser = { uid: string; name: string; email: string; photoURL: string | null };
export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

type AuthState = {
  status: AuthStatus;
  user: AuthUser | null;
  /** A user-facing message for the last failed sign-in, or null. */
  error: string | null;
  /** True after an interactive sign-in this session (drives first-run focus and copy). */
  freshSignIn: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const HINT_KEY = 'auth-hint';
const REDIRECT_KEY = 'auth-redirecting';

const read = (storage: () => Storage, key: string) => {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
};
const write = (storage: () => Storage, key: string, value: string | null) => {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    /* storage unavailable */
  }
};

/** A returning user (or one coming back from the redirect flow) is probably signed in. */
export const hasAuthHint = () =>
  read(() => localStorage, HINT_KEY) === '1' || read(() => sessionStorage, REDIRECT_KEY) === '1';

const toAuthUser = (user: User): AuthUser => ({
  uid: user.uid,
  name: user.displayName ?? user.email?.split('@')[0] ?? 'Account',
  email: user.email ?? '',
  photoURL: user.photoURL,
});

/**
 * Google refuses OAuth inside embedded in-app browsers (Instagram, Facebook, LinkedIn, …), so the
 * landing page asks those visitors to open the site in their real browser instead.
 */
export const isInAppBrowser = (ua = typeof navigator === 'undefined' ? '' : navigator.userAgent) =>
  /FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Line\/|Twitter|MicroMessenger|Snapchat|TikTok|musical_ly/i.test(
    ua,
  );

const SILENT_CODES = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/user-cancelled',
]);

function messageFor(error: unknown): string | null {
  const code = (error as { code?: string } | null)?.code;
  if (code && SILENT_CODES.has(code)) return null;
  if (code === 'auth/network-request-failed') return "Can't reach Google. Check your connection.";
  if (code === 'auth/unauthorized-domain') return "This site isn't authorized for sign-in yet.";
  return 'Sign-in failed. Please try again.';
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  status: 'loading',
  user: null,
  error: null,
  freshSignIn: false,

  signInWithGoogle: async () => {
    set({ error: null });
    try {
      // Popup first everywhere, phones included. The redirect flow hands off between the auth
      // domain (firebaseapp.com) and the site (web.app), which Safari and Chrome's storage
      // partitioning break: the user comes back signed out. On mobile the popup opens a tab.
      // It must open synchronously inside the click, so nothing is awaited before this call.
      try {
        await signInWithPopup(auth, googleProvider, popupRedirect);
        set({ freshSignIn: true });
      } catch (error) {
        if ((error as { code?: string }).code !== 'auth/popup-blocked') throw error;
        write(() => sessionStorage, REDIRECT_KEY, '1');
        await signInWithRedirect(auth, googleProvider, popupRedirect);
      }
    } catch (error) {
      write(() => sessionStorage, REDIRECT_KEY, null);
      set({ error: messageFor(error) });
    }
  },

  signOut: async () => {
    if (get().status !== 'signedIn') return;
    // Push pending edits while still authorized, then stop syncing before anything is reset.
    await flushActiveSync();
    stopActiveSync();
    write(() => localStorage, HINT_KEY, null);
    set({ freshSignIn: false });
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('[auth] sign-out failed', error);
    }
    stopActiveSync();
    resetTaskStore();
  },
}));

/** Wires Firebase auth into the store. Call once at startup; returns an unsubscribe. */
export function initAuth(): () => void {
  // Only a redirect sign-in (or the delete-account re-auth) that is actually in flight needs its
  // result fetched; checking on every load would pull in Google's iframe script for nothing.
  const redirectPending = read(() => sessionStorage, REDIRECT_KEY) === '1' || isDeletePending();
  if (redirectPending) handleRedirectResult();
  return watchAuthState();
}

function handleRedirectResult(): void {
  void getRedirectResult(auth, popupRedirect)
    .then((result) => {
      write(() => sessionStorage, REDIRECT_KEY, null);
      if (result?.user && isDeletePending()) {
        // Back from the re-authentication redirect that "Delete account" started: finish the job.
        void import('../sync/deleteAccount')
          .then((m) => m.resumeDeleteAccount())
          .then((error) => {
            if (error && error.code !== 'cancelled') {
              useUIStore.getState().showNotice(error.message);
            }
          });
      } else if (result?.user) useAuthStore.setState({ freshSignIn: true });
      else clearDeletePending();
    })
    .catch((error) => {
      clearDeletePending();
      write(() => sessionStorage, REDIRECT_KEY, null);
      useAuthStore.setState({ error: messageFor(error) });
    });
}

function watchAuthState(): () => void {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      write(() => localStorage, HINT_KEY, '1');
      useAuthStore.setState({ status: 'signedIn', user: toAuthUser(user) });
    } else {
      write(() => localStorage, HINT_KEY, null);
      // Anything left from the previous session must not leak into the next account. Sync stops
      // first: a reset while it is watching the store would be written out as deletions.
      stopActiveSync();
      resetTaskStore();
      useAuthStore.setState({ status: 'signedOut', user: null, freshSignIn: false });
    }
  });
}
