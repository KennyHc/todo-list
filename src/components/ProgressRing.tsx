import { motion } from 'framer-motion';
import styles from './ProgressRing.module.css';

const SIZE = 28;
const STROKE = 2.5;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

/** Circular progress indicator; the arc eases to its new length with a spring. */
export function ProgressRing({ value }: { value: number }) {
  const v = Math.min(1, Math.max(0, value));
  return (
    <svg
      className={styles.ring}
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      aria-hidden="true"
    >
      <circle className={styles.track} cx={SIZE / 2} cy={SIZE / 2} r={R} strokeWidth={STROKE} />
      <motion.circle
        className={styles.arc}
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={R}
        strokeWidth={STROKE}
        strokeDasharray={C}
        initial={false}
        animate={{ strokeDashoffset: C * (1 - v) }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      />
    </svg>
  );
}
