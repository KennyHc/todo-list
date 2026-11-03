import { X } from 'lucide-react';
import { tagColor } from '../lib/tags';
import styles from './TagChip.module.css';

type Props = {
  tag: string;
  /** Makes the chip a button (e.g. to filter by it). */
  onClick?: () => void;
  onRemove?: () => void;
  /** Dims the chip, for suggestions or previews that are not committed yet. */
  muted?: boolean;
  /** Shows the label as `#tag`. */
  hash?: boolean;
};

export function TagChip({ tag, onClick, onRemove, muted, hash }: Props) {
  const style = { ['--tag' as string]: tagColor(tag) };
  const body = (
    <>
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>
        {hash ? '#' : ''}
        {tag}
      </span>
    </>
  );
  return (
    <span className={`${styles.chip} ${muted ? styles.muted : ''}`} style={style}>
      {onClick ? (
        <button
          type="button"
          className={`${styles.body} ${styles.clickable}`}
          aria-label={`Filter by tag ${tag}`}
          onClick={onClick}
        >
          {body}
        </button>
      ) : (
        <span className={styles.body}>{body}</span>
      )}
      {onRemove && (
        <button
          type="button"
          className={styles.remove}
          aria-label={`Remove tag ${tag}`}
          onClick={onRemove}
        >
          <X size={11} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
