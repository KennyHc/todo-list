import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { TASK_COLORS } from '../lib/colors';
import styles from './ColorPicker.module.css';

type Props = { value: string; onChange: (hex: string) => void; onClose: () => void };

const SPECTRUM = `conic-gradient(${[...TASK_COLORS, TASK_COLORS[0]].map((c) => c.hex).join(', ')})`;

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
    <motion.div
      ref={ref}
      className={styles.popover}
      role="dialog"
      aria-label="Task colour"
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: -4 }}
      transition={{ duration: 0.14, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div className={styles.grid}>
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
      </div>
      <span className={styles.sep} aria-hidden="true" />
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
    </motion.div>
  );
}
