import { useSyncStore } from '../sync/status';
import { InfoToast } from './InfoToast';

const plural = (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'}`;

/** One-shot info toast (no undo) after tasks from this device were moved to the account. */
export function MigrationToast() {
  const count = useSyncStore((s) => s.migratedCount);
  return (
    <InfoToast
      id="migrated"
      message={count === null ? null : `Moved ${plural(count)} from this device to your account`}
      onDismiss={() => useSyncStore.getState().setMigratedCount(null)}
    />
  );
}
