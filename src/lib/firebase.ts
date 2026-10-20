import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from 'firebase/auth';

/**
 * Browser-only Firebase app + auth bootstrap. It must never import `firebase/firestore`: this
 * module is on the landing page's path, and Firestore lives in src/lib/firestore.ts, which only
 * the lazy-loaded app chunk imports. Unit tests never touch it (src/test/setup.ts mocks it).
 */
const env = import.meta.env;
const useEmulators = env.VITE_USE_EMULATORS === '1';

export const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});

export const auth = getAuth(app);

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Test hook for Playwright against the emulators. The condition is a compile-time constant, so
// production builds drop the whole block (scripts/check-bundle.mjs asserts that).
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === '1') {
  void import('../test/e2eHook').then((m) => m.installE2eHook(auth));
}
