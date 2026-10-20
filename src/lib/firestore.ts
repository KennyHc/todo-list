import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { app } from './firebase';

/**
 * Browser-only Firestore bootstrap, imported by the lazy-loaded app chunk (sync engine and
 * account deletion) and never by the landing page. Unit tests mock it (src/test/setup.ts).
 */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  // Optional fields (e.g. `completedAt`) are simply left out of writes.
  ignoreUndefinedProperties: true,
});

if (import.meta.env.VITE_USE_EMULATORS === '1') {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
