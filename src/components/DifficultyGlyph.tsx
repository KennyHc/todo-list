import type { Difficulty } from '../types';
import { LEVELS } from '../lib/difficulty';
import styles from './DifficultyGlyph.module.css';

const HEIGHTS = [4, 6, 8, 10, 12];
const BAR_W = 2;
const GAP = 1.5;
const W = 16;
const H = 14;
// Centre the five bars (5 * 2 + 4 * 1.5 = 16) in the 16px box.
const X0 = (W - (5 * BAR_W + 4 * GAP)) / 2;

/** A "signal strength" glyph: five ascending bars, the first `value` of them filled. */
export function DifficultyGlyph({ value, color }: { value: Difficulty; color: string }) {
  return (
    <svg
      className={styles.glyph}
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      focusable="false"
      data-hot={value === 5 || undefined}
      style={{ ['--task-color' as string]: color }}
    >
      {LEVELS.map((level, i) => (
        <rect
          key={level}
          className={level <= value ? styles.on : styles.off}
          data-filled={level <= value}
          x={X0 + i * (BAR_W + GAP)}
          y={H - HEIGHTS[i]}
          width={BAR_W}
          height={HEIGHTS[i]}
          rx={1}
        />
      ))}
    </svg>
  );
}
