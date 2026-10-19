import { Search } from 'lucide-react';
import { useUIStore } from '../store/ui';
import { Keys } from './Kbd';
import styles from './SearchButton.module.css';

/** Toolbar entry point to the command palette. Icon only on narrow screens. */
export function SearchButton() {
  const setOpen = useUIStore((s) => s.setPaletteOpen);
  return (
    <button
      type="button"
      className={styles.button}
      aria-label="Search"
      aria-haspopup="dialog"
      onClick={() => setOpen(true)}
    >
      <Search size={13} strokeWidth={1.75} aria-hidden="true" />
      <span className={styles.label}>Search</span>
      <span className={styles.keys}>
        <Keys keys={['mod', 'K']} />
      </span>
    </button>
  );
}
