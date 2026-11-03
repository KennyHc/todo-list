import { useCallback, useRef, useState } from 'react';
import { DIFFICULTY_NAMES, difficultyAria } from '../lib/difficulty';
import type { Difficulty } from '../types';
import { DifficultyGlyph } from './DifficultyGlyph';
import { DifficultyMenu } from './DifficultyMenu';
import styles from './DifficultyIcon.module.css';

type Props = {
  value: Difficulty;
  onChange: (d: Difficulty) => void;
  /** Dim the glyph, e.g. on a finished row. */
  dimmed?: boolean;
  /** -1 inside a task row, which is the Tab stop for its controls (roving tabindex). */
  tabIndex?: number;
};

/** A row's difficulty as a small signal-strength glyph; clicking it opens the level menu. */
export function DifficultyIcon({ value, onChange, dimmed = false, tabIndex }: Props) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={`${styles.button} ${dimmed ? styles.dimmed : ''}`}
        aria-label={`${difficultyAria(value)} — change`}
        title={DIFFICULTY_NAMES[value]}
        aria-haspopup="dialog"
        aria-expanded={open}
        tabIndex={tabIndex}
        onClick={() => setOpen((o) => !o)}
      >
        <DifficultyGlyph value={value} />
      </button>
      <DifficultyMenu
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        value={value}
        onChange={onChange}
      />
    </>
  );
}
