import { useCallback, useEffect, useRef } from 'react';
import { Check, Filter, Palette } from 'lucide-react';
import { useAllTags, useTagColors } from '../store/tasks';
import { useUIStore } from '../store/ui';
import { Popover } from './Popover';
import { TagChip } from './TagChip';
import { tagColor } from '../lib/tags';
import styles from './TagFilter.module.css';

/**
 * One line under the toolbar while a tag filter is on, in every view: "Filtered by #work · Clear".
 * The toolbar row has no room for the chip next to the views, so it lives here.
 */
export function FilterBanner() {
  const tagFilter = useUIStore((s) => s.tagFilter);
  const setTagFilter = useUIStore((s) => s.setTagFilter);
  if (tagFilter === null) return null;
  return (
    <div className={styles.banner} role="status">
      <span className={styles.bannerText}>Filtered by</span>
      <TagChip tag={tagFilter} hash />
      <span className={styles.bannerDot} aria-hidden="true">
        {'·'}
      </span>
      <button type="button" className={styles.clear} onClick={() => setTagFilter(null)}>
        Clear
      </button>
    </div>
  );
}

export function TagFilter() {
  const tags = useAllTags();
  const tagColors = useTagColors();
  const tagFilter = useUIStore((s) => s.tagFilter);
  const setTagFilter = useUIStore((s) => s.setTagFilter);
  const open = useUIStore((s) => s.filterOpen);
  const setOpen = useUIStore((s) => s.setFilterOpen);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), [setOpen]);

  // The `/` hotkey can ask for the popover while this toolbar isn't mounted; don't let it linger.
  useEffect(() => () => setOpen(false), [setOpen]);

  // A filter on a tag nobody uses any more would show an empty list with no way to tell why.
  useEffect(() => {
    if (tagFilter !== null && !tags.some((t) => t.tag === tagFilter)) setTagFilter(null);
  }, [tagFilter, tags, setTagFilter]);

  return (
    <div className={styles.filter}>
      <button
        ref={anchorRef}
        type="button"
        className={`${styles.button} ${tagFilter !== null ? styles.active : ''}`}
        aria-label="Filter"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Filter size={13} strokeWidth={1.75} aria-hidden="true" />
        <span className={styles.buttonLabel}>Filter</span>
      </button>
      <Popover
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        label="Filter by tag"
        align="end"
        width={220}
      >
        {tags.length === 0 ? (
          <p className={styles.empty}>No tags yet. Add one with #tag when creating a task.</p>
        ) : (
          <ul className={styles.list}>
            {tags.map(({ tag, count }) => (
              <li key={tag}>
                <button
                  type="button"
                  className={styles.item}
                  aria-pressed={tag === tagFilter}
                  onClick={() => {
                    setTagFilter(tag === tagFilter ? null : tag);
                    close();
                  }}
                >
                  <span
                    className={styles.dot}
                    style={{ background: tagColors[tag] ?? tagColor(tag) }}
                  />
                  <span className={styles.name}>#{tag}</span>
                  <span className={styles.count}>{count}</span>
                  <Check size={13} strokeWidth={2} className={styles.check} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {tags.length > 0 && (
          <button
            type="button"
            className={styles.editColors}
            onClick={() => {
              close();
              useUIStore.getState().setTagColorsOpen(true);
            }}
          >
            <Palette size={13} strokeWidth={1.75} aria-hidden="true" />
            <span>Edit colours</span>
          </button>
        )}
      </Popover>
    </div>
  );
}
