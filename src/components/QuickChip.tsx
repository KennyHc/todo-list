import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import styles from './QuickChip.module.css';

type Props = {
  icon: ReactNode;
  label: string;
  /** Dismisses the recognised phrase so it stays in the title as typed. */
  onRemove: () => void;
  removeLabel: string;
  /** Accent colour, for something due today. */
  accent?: boolean;
  /** Dimmed: recognised but not used (e.g. a picked due date wins). */
  muted?: boolean;
  title?: string;
};

/** A recognised quick-add phrase (date, difficulty, repeat) shown as a removable chip. */
export function QuickChip({ icon, label, onRemove, removeLabel, accent, muted, title }: Props) {
  return (
    <span
      className={`${styles.chip} ${accent ? styles.accent : ''} ${muted ? styles.muted : ''}`}
      title={title}
    >
      <span className={styles.icon}>{icon}</span>
      <span className={styles.label}>{label}</span>
      <button type="button" className={styles.remove} aria-label={removeLabel} onClick={onRemove}>
        <X size={10} strokeWidth={2.25} aria-hidden="true" />
      </button>
    </span>
  );
}
