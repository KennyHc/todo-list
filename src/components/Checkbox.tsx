import { useState } from 'react';
import { motion } from 'framer-motion';
import styles from './Checkbox.module.css';

type Props = {
  checked: boolean;
  color: string;
  onToggle: () => void;
  label?: string;
  /** Seconds to wait before animating a done-state change (cascade timing). */
  delay?: number;
};

const EASE = [0.65, 0, 0.35, 1] as const;

/** Same colour at zero alpha, so the fill interpolates without a muddy mid-tone. */
const clear = (hex: string) => (/^#[0-9a-f]{6}$/i.test(hex) ? `${hex}00` : 'transparent');

export function Checkbox({ checked, color, onToggle, label = 'Done', delay = 0 }: Props) {
  // Bumped on every transition to checked so the ring burst remounts and replays.
  const [prevChecked, setPrevChecked] = useState(checked);
  const [burst, setBurst] = useState(0);
  if (prevChecked !== checked) {
    setPrevChecked(checked);
    setBurst(checked ? burst + 1 : 0);
  }

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={styles.hit}
      onClick={onToggle}
    >
      {burst > 0 && (
        <motion.span
          key={burst}
          className={styles.ring}
          style={{ borderColor: color, background: color }}
          initial={{ scale: 0.6, opacity: 0.5 }}
          animate={{ scale: 1.6, opacity: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut', delay }}
          aria-hidden="true"
        />
      )}
      <motion.span
        className={styles.box}
        style={{ borderColor: color }}
        initial={false}
        whileTap={{ scale: 0.85 }}
        animate={
          checked
            ? {
                scale: [1, 0.9, 1.08, 1],
                backgroundColor: color,
                transition: {
                  scale: { duration: 0.35, delay, times: [0, 0.25, 0.65, 1], ease: 'easeOut' },
                  backgroundColor: { duration: 0.2, delay },
                },
              }
            : {
                scale: 1,
                backgroundColor: clear(color),
                transition: {
                  scale: { type: 'spring', stiffness: 500, damping: 30 },
                  backgroundColor: { duration: 0.15, delay },
                },
              }
        }
      >
        <svg className={styles.svg} viewBox="0 0 24 24" aria-hidden="true">
          <motion.path
            className={styles.check}
            d="M6 12.5l4 4 8-9"
            initial={false}
            animate={
              checked
                ? {
                    pathLength: 1,
                    opacity: 1,
                    transition: { duration: 0.28, ease: EASE, delay: delay + 0.06 },
                  }
                : { pathLength: 0, opacity: 0, transition: { duration: 0.15 } }
            }
          />
        </svg>
      </motion.span>
    </button>
  );
}
