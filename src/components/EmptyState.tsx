import { Check } from 'lucide-react';
import styles from './EmptyState.module.css';

export function EmptyState({ welcome = false }: { welcome?: boolean }) {
  return (
    <div className={styles.card}>
      <div className={styles.icon}>
        <Check size={18} strokeWidth={2} aria-hidden="true" />
      </div>
      <p className={styles.title}>{welcome ? "What's on your mind?" : 'All clear'}</p>
      <p className={styles.hint}>
        {welcome
          ? 'Type a task above and press Enter.'
          : 'Add a task above. Big ones can be broken into subtasks.'}
      </p>
    </div>
  );
}
