import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { LEVELS, difficultyAria, difficultyLabel } from '../lib/difficulty';
import type { Difficulty } from '../types';
import styles from './DifficultyPicker.module.css';

const POP_STAGGER = 0.03;

type Props = {
  value: Difficulty;
  onChange: (d: Difficulty) => void;
  /** Arrow keys change the value (true), or only move the cursor until Enter/Space (false). */
  arrowSelects?: boolean;
  /** Focus the current value's segment on mount. */
  autoFocus?: boolean;
  /** Stretch the segments to the container's width. */
  fill?: boolean;
};

/**
 * Five numbered segments with a live name underneath. Segments 1..value are filled with the
 * accent; hovering (or moving the cursor) previews another level.
 */
export function DifficultyPicker({
  value,
  onChange,
  arrowSelects = true,
  autoFocus = false,
  fill = false,
}: Props) {
  const [hover, setHover] = useState<Difficulty | null>(null);
  const [cursor, setCursor] = useState<Difficulty>(value);
  const groupRef = useRef<HTMLDivElement>(null);
  // Remember what the value was before the latest change, so only newly filled segments pop.
  const [change, setChange] = useState({ value, from: value, seq: 0 });
  if (change.value !== value) {
    setChange({ value, from: change.value, seq: change.seq + 1 });
  }

  useEffect(() => {
    if (autoFocus) (groupRef.current?.children[value - 1] as HTMLElement | undefined)?.focus();
    // Only on mount: the value changing afterwards must not steal focus.
  }, []);

  const preview = hover ?? (arrowSelects ? null : cursor);
  const previewing = preview !== null && preview !== value;
  const shown = previewing ? preview : value;

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const from = arrowSelects ? value : cursor;
    const next = Math.min(5, Math.max(1, from + step)) as Difficulty;
    if (next === from) return;
    if (arrowSelects) onChange(next);
    else setCursor(next);
    (groupRef.current?.children[next - 1] as HTMLElement | undefined)?.focus();
  };

  const tabStop = arrowSelects ? value : cursor;

  return (
    <div className={`${styles.wrap} ${fill ? styles.fill : ''}`}>
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label={difficultyAria(value)}
        className={styles.group}
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
              aria-label={difficultyAria(level)}
              tabIndex={level === tabStop ? 0 : -1}
              className={`${styles.seg} ${filled ? styles.filled : ''}`}
              onClick={() => onChange(level)}
              onKeyDown={onKeyDown}
              onFocus={() => !arrowSelects && setCursor(level)}
              onMouseEnter={() => setHover(level)}
            >
              <motion.span
                // Remounting on each change replays the pop for newly filled segments only.
                key={popping ? `pop-${change.seq}` : 'still'}
                className={styles.fillBg}
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
      </div>
      <p className={styles.label} aria-live="polite">
        {difficultyLabel(shown)}
      </p>
    </div>
  );
}
