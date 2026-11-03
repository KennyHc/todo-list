import { keyLabel } from '../lib/platform';
import styles from './Kbd.module.css';

/** One key cap. 'mod' and 'alt' render as the platform's modifier. */
export function Kbd({ children }: { children: string }) {
  return <kbd className={styles.kbd}>{keyLabel(children)}</kbd>;
}

/** The caps of one combination, e.g. ['mod', 'K'] -> [⌘][K]. */
export function Keys({ keys }: { keys: string[] }) {
  return (
    <span className={styles.keys} aria-hidden="true">
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </span>
  );
}
