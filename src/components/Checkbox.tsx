import styles from './Checkbox.module.css';

type Props = { checked: boolean; color: string; onToggle: () => void; label?: string };

export function Checkbox({ checked, color, onToggle, label = 'Done' }: Props) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={styles.hit}
      onClick={onToggle}
    >
      <span
        className={styles.box}
        style={{ borderColor: color, background: checked ? color : 'transparent' }}
      >
        <svg className={styles.svg} viewBox="0 0 24 24" aria-hidden="true">
          {checked && <path className={styles.check} d="M6 12.5l4 4 8-9" />}
        </svg>
      </span>
    </button>
  );
}
