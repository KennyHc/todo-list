import { useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Difficulty } from '../types';
import styles from './DifficultyPicker.module.css';

const LEVELS: Difficulty[] = [1, 2, 3, 4, 5];
const NAMES: Record<Difficulty, string> = {
  1: 'Trivial',
  2: 'Easy',
  3: 'Medium',
  4: 'Hard',
  5: 'Huge',
};
const POP_STAGGER = 0.03;

type Props = { value: Difficulty; color: string; onChange: (d: Difficulty) => void };

/** Five joined numbered segments. Segments 1..value are filled with the task colour. */
export function DifficultyPicker({ value, color, onChange }: Props) {
  const [hover, setHover] = useState<Difficulty | null>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  // Remember what the value was before the latest change, so only newly filled segments pop.
  const [change, setChange] = useState({ value, from: value, seq: 0 });
  if (change.value !== value) {
    setChange({ value, from: change.value, seq: change.seq + 1 });
  }

  const previewing = hover !== null && hover !== value;
  const shown = previewing ? hover : value;

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const next = Math.min(5, Math.max(1, value + step)) as Difficulty;
    if (next === value) return;
    onChange(next);
    (groupRef.current?.children[next - 1] as HTMLElement | undefined)?.focus();
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={`Difficulty ${value} of 5, ${NAMES[value]}`}
      className={styles.group}
      style={{ ['--task-color' as string]: color }}
      onMouseLeave={() => setHover(null)}
    >
      {LEVELS.map((level) => {
        const filled = level <= shown;
        const popping = !previewing && level <= value && level > change.from;
        const opacity = filled ? (previewing ? 0.55 : 1) : 0;
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={level === value}
            aria-label={`Difficulty ${level} of 5, ${NAMES[level]}`}
            tabIndex={level === value ? 0 : -1}
            className={`${styles.seg} ${filled ? styles.filled : ''}`}
            onClick={() => onChange(level)}
            onKeyDown={onKeyDown}
            onMouseEnter={() => setHover(level)}
          >
            <motion.span
              // Remounting on each change replays the pop for newly filled segments only.
              key={popping ? `pop-${change.seq}` : 'still'}
              className={styles.fill}
              aria-hidden="true"
              initial={{ scale: popping ? 0.85 : 1, opacity }}
              animate={{ scale: 1, opacity }}
              transition={{
                scale: {
                  type: 'spring',
                  stiffness: 600,
                  damping: 18,
                  delay: popping ? (level - change.from - 1) * POP_STAGGER : 0,
                },
                opacity: { duration: 0.12 },
              }}
            />
            <span className={styles.num}>{level}</span>
          </button>
        );
      })}
      <AnimatePresence>
        {hover !== null && (
          <motion.span
            key="tip"
            className={styles.tip}
            aria-hidden="true"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 3 }}
            transition={{ duration: 0.12 }}
          >
            {hover} {NAMES[hover]}
            {hover === 5 && ' — consider splitting'}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
