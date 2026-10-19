import type { Difficulty } from '../types';
import styles from './DifficultyPicker.module.css';

const LEVELS: Difficulty[] = [1, 2, 3, 4, 5];

type Props = { value: Difficulty; color: string; onChange: (d: Difficulty) => void };

export function DifficultyPicker({ value, color, onChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label={`Difficulty ${value} of 5`}
      className={styles.group}
      style={{ ['--task-color' as string]: color }}
    >
      {LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          role="radio"
          aria-checked={level === value}
          aria-label={`Difficulty ${level}`}
          className={`${styles.dot} ${level <= value ? styles.filled : ''}`}
          onClick={() => onChange(level)}
        />
      ))}
    </div>
  );
}
