import type { ReactNode } from 'react';
import styles from './StrikeText.module.css';

type Props = { done: boolean; children: ReactNode };

export function StrikeText({ done, children }: Props) {
  return (
    <span className={`${styles.wrap} ${done ? styles.done : ''}`}>
      <span className={styles.text}>{children}</span>
      <span className={`${styles.line} ${done ? styles.lineOn : ''}`} aria-hidden="true" />
    </span>
  );
}
