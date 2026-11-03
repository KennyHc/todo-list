import { TASK_COLORS } from '../lib/colors';
import styles from './ColorPicker.module.css';

type Props = { value: string; onChange: (hex: string) => void };

const SPECTRUM = `conic-gradient(${[...TASK_COLORS, TASK_COLORS[0]].map((c) => c.hex).join(', ')})`;

/** Inline colour swatches plus a custom colour input. */
export function ColorPicker({ value, onChange }: Props) {
  return (
    <div className={styles.swatches} role="group" aria-label="Task colour">
      {TASK_COLORS.map((c) => (
        <button
          key={c.hex}
          type="button"
          aria-label={c.name}
          aria-pressed={c.hex.toLowerCase() === value.toLowerCase()}
          className={styles.swatch}
          style={{ background: c.hex }}
          onClick={() => onChange(c.hex)}
        />
      ))}
      <label
        className={`${styles.swatch} ${styles.custom}`}
        title="Custom colour"
        style={{ background: SPECTRUM }}
      >
        <input
          type="color"
          aria-label="Custom colour"
          className={styles.native}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}
