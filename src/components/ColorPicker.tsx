import { useEffect, useRef } from 'react';
import { TASK_COLORS } from '../lib/colors';
import styles from './ColorPicker.module.css';

type Props = { value: string; onChange: (hex: string) => void; onClose: () => void };

export function ColorPicker({ value, onChange, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} className={styles.popover} role="dialog" aria-label="Task colour">
      {TASK_COLORS.map((c) => (
        <button
          key={c.hex}
          type="button"
          aria-label={c.name}
          aria-pressed={c.hex.toLowerCase() === value.toLowerCase()}
          className={styles.swatch}
          style={{ background: c.hex }}
          onClick={() => {
            onChange(c.hex);
            onClose();
          }}
        />
      ))}
      <label className={`${styles.swatch} ${styles.custom}`} title="Custom colour">
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
