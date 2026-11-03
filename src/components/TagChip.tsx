import { X } from 'lucide-react';
import { tagColor } from '../lib/tags';
import { useTaskStore } from '../store/tasks';
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
  /** Turns the colour dot into a button (e.g. to open that tag's colour picker). */
  onColor?: () => void;
  /** Reflects an open colour picker on the dot button. */
  colorOpen?: boolean;
  /** Rows and lists: just the colour dot and the name, no pill. Chips stay pills. */
  plain?: boolean;
  /** -1 inside a task row, which is the Tab stop for its controls (roving tabindex). */
  tabIndex?: number;
};

/** A tag chip in the tag's assigned colour, or else its stable hash colour (chips only). */
export function TagChip({
  tag,
  onClick,
  onRemove,
  muted,
  hash,
  onColor,
  colorOpen,
  plain,
  tabIndex,
}: Props) {
  const assigned = useTaskStore((s) => s.tagColors[tag]);
  const style = { ['--tag' as string]: assigned ?? tagColor(tag) };
  const body = (
    <>
      {!onColor && <span className={styles.dot} aria-hidden="true" />}
      <span className={styles.label}>
        {hash ? '#' : ''}
        {tag}
      </span>
    </>
  );
  return (
    <span
      className={`${styles.chip} ${plain ? styles.plain : ''} ${muted ? styles.muted : ''}`}
      style={style}
      data-assigned={assigned ? '' : undefined}
    >
      {onColor && (
        <button
          type="button"
          className={styles.dotBtn}
          aria-label={`Colour for #${tag}`}
          aria-expanded={colorOpen}
          title={`Colour for #${tag}`}
          tabIndex={tabIndex}
          onClick={onColor}
        >
          <span className={styles.dot} aria-hidden="true" />
        </button>
      )}
      {onClick ? (
        <button
          type="button"
          className={`${styles.body} ${styles.clickable}`}
          aria-label={`Filter by tag ${tag}`}
          tabIndex={tabIndex}
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
          tabIndex={tabIndex}
          onClick={onRemove}
        >
          <X size={11} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
