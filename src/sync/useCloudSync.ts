import { useEffect } from 'react';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/auth';
import { startSync } from './firestoreSync';

/** Runs cloud sync while signed in, keyed by uid; stops it on sign-out or unmount. */
export function useCloudSync(): void {
  const uid = useAuthStore((s) => (s.status === 'signedIn' ? (s.user?.uid ?? null) : null));
  useEffect(() => {
    if (!uid) return;
    return startSync(uid, { db });
  }, [uid]);
}
