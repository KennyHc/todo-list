import { useEffect, useRef, type RefObject } from 'react';
import type { Difficulty } from '../types';
import { DifficultyPicker } from './DifficultyPicker';
import { Popover } from './Popover';
import styles from './DifficultyMenu.module.css';

/** Long enough to see the newly filled segments pop before the menu goes away. */
const CLOSE_DELAY = 150;

type Props = {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  value: Difficulty;
  color: string;
  onChange: (d: Difficulty) => void;
};

/** The popover (a bottom sheet on phones) behind a row's difficulty icon. */
export function DifficultyMenu({ open, onClose, anchorRef, value, color, onChange }: Props) {
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const choose = (d: Difficulty) => {
    onChange(d);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(onClose, CLOSE_DELAY);
  };

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      label="Difficulty"
      align="end"
      width={196}
    >
      <h3 className={styles.heading}>Difficulty</h3>
      <DifficultyPicker
        value={value}
        color={color}
        onChange={choose}
        arrowSelects={false}
        autoFocus
      />
    </Popover>
  );
}
