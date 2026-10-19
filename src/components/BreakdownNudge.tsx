import styles from './BreakdownNudge.module.css';

type Props = { onBreakdown: () => void };

export function BreakdownNudge({ onBreakdown }: Props) {
  return (
    <div className={styles.card}>
      <span>This looks big — break it down?</span>
      <button type="button" className={styles.button} onClick={onBreakdown}>
        Add subtasks
      </button>
    </div>
  );
}
