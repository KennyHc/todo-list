import { TASK_COLORS } from '../lib/colors';
import styles from './ColorPicker.module.css';

type Props = {
  /** The chosen colour, or null for the "no explicit colour" swatch. */
  value: string | null;
  /** A hex colour, or null when the first ("Auto" / "None") swatch is picked. */
  onChange: (hex: string | null) => void;
  /** Accessible name of the group. */
  label?: string;
  /** Name of the first swatch: "Auto" for a task, "None" for a tag. */
  noneLabel?: string;
  /** Adds a custom colour input after the presets (tasks only). */
  custom?: boolean;
};

const SPECTRUM = `conic-gradient(${[...TASK_COLORS, TASK_COLORS[0]].map((c) => c.hex).join(', ')})`;

/** Inline colour swatches: a none/auto swatch first, the presets, optionally a custom colour. */
export function ColorPicker({
  value,
  onChange,
  label = 'Task colour',
  noneLabel = 'Auto',
  custom = true,
}: Props) {
  return (
    <div className={styles.swatches} role="group" aria-label={label}>
      <button
        type="button"
        aria-label={noneLabel}
        title={noneLabel}
        aria-pressed={value === null}
        className={`${styles.swatch} ${styles.none}`}
        onClick={() => onChange(null)}
      />
      {TASK_COLORS.map((c) => (
        <button
          key={c.hex}
          type="button"
          aria-label={c.name}
          aria-pressed={value !== null && c.hex.toLowerCase() === value.toLowerCase()}
          className={styles.swatch}
          style={{ background: c.hex }}
          onClick={() => onChange(c.hex)}
        />
      ))}
      {custom && (
        <label
          className={`${styles.swatch} ${styles.custom}`}
          title="Custom colour"
          style={{ background: SPECTRUM }}
        >
          <input
            type="color"
            aria-label="Custom colour"
            className={styles.native}
            value={value ?? '#a9c6f5'}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      )}
    </div>
  );
}
