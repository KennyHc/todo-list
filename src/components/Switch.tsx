import type { ButtonHTMLAttributes } from 'react';
import styles from './Switch.module.css';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'role' | 'type'> & {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

/** The compact on/off switch: a button with role="switch". Name it with a label or aria-label. */
export function SwitchButton({ checked, onChange, className, ...rest }: Props) {
  return (
    <button
      {...rest}
      type="button"
      role="switch"
      aria-checked={checked}
      className={className ? `${styles.switch} ${className}` : styles.switch}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.thumb} aria-hidden="true" />
    </button>
  );
}
