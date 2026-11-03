import { Check } from 'lucide-react';
import styles from './EmptyState.module.css';

export function EmptyState() {
  return (
    <div className={styles.card}>
      <div className={styles.icon}>
        <Check size={18} strokeWidth={2} aria-hidden="true" />
      </div>
      <p className={styles.title}>All clear</p>
      <p className={styles.hint}>Add a task above. Big ones can be broken into subtasks.</p>
    </div>
  );
}
