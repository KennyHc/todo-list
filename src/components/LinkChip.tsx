import { Link2 } from 'lucide-react';
import { linkHost } from '../lib/links';
import styles from './LinkChip.module.css';

/** A link from a task's title, shown quietly as its host ("github.com"); opens in a new tab. */
export function LinkChip({ href }: { href: string }) {
  return (
    <a
      className={styles.chip}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={href}
      data-swipe-through
    >
      <Link2 size={12} strokeWidth={1.75} aria-hidden="true" />
      <span className={styles.host}>{linkHost(href)}</span>
    </a>
  );
}
