import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Difficulty } from '../types';
import styles from './DifficultyPicker.module.css';

const LEVELS: Difficulty[] = [1, 2, 3, 4, 5];
const POP_STAGGER = 0.025;

type Props = { value: Difficulty; color: string; onChange: (d: Difficulty) => void };

export function DifficultyPicker({ value, color, onChange }: Props) {
  // Remember what the value was before the latest change, so only newly filled dots pop.
  const [change, setChange] = useState({ value, from: value, seq: 0 });
  if (change.value !== value) {
    setChange({ value, from: change.value, seq: change.seq + 1 });
  }

  return (
    <div
      role="radiogroup"
      aria-label={`Difficulty ${value} of 5`}
      className={styles.group}
      style={{ ['--task-color' as string]: color }}
    >
      {LEVELS.map((level) => {
        const popping = level <= value && level > change.from;
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={level === value}
            aria-label={`Difficulty ${level}`}
            className={styles.hit}
            onClick={() => onChange(level)}
          >
            <motion.span
              // Remounting on each change replays the pop for newly filled dots only.
              key={popping ? `pop-${change.seq}` : 'still'}
              className={`${styles.bar} ${level <= value ? styles.filled : ''}`}
              initial={popping ? { scale: 0.6 } : false}
              animate={{ scale: 1 }}
              transition={{
                type: 'spring',
                stiffness: 600,
                damping: 18,
                delay: popping ? (level - change.from - 1) * POP_STAGGER : 0,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
