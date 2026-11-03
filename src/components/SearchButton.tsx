import { Search } from 'lucide-react';
import { useUIStore } from '../store/ui';
import { Keys } from './Kbd';
import styles from './SearchButton.module.css';

/**
 * Toolbar entry point to the command palette: the icon and its shortcut, or the icon alone on
 * narrow screens. No "Search" word: five labelled views fill the 648px column without it.
 */
export function SearchButton() {
  const setOpen = useUIStore((s) => s.setPaletteOpen);
  return (
    <button
      type="button"
      className={styles.button}
      aria-label="Search"
      title="Search"
      aria-haspopup="dialog"
      onClick={() => setOpen(true)}
    >
      <Search size={13} strokeWidth={1.75} aria-hidden="true" />
      <span className={styles.keys}>
        <Keys keys={['mod', 'K']} />
      </span>
    </button>
  );
}
