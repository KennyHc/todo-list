import App from './App';
import { Splash } from './components/Splash';
import { useSyncStore } from './sync/status';
import { useCloudSync } from './sync/useCloudSync';

/**
 * Everything a signed-in user needs, as one lazy chunk: the app plus the Firestore sync engine.
 * Sync starts as soon as this mounts; the splash holds until the first load settles.
 */
export default function SignedIn() {
  const syncStatus = useSyncStore((s) => s.syncStatus);
  useCloudSync();
  return syncStatus === 'loading' ? <Splash /> : <App />;
}
