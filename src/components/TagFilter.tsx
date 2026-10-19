import { useCallback, useEffect, useRef } from 'react';
import { Check, Filter } from 'lucide-react';
import { useAllTags } from '../store/tasks';
import { useUIStore } from '../store/ui';
import { Popover } from './Popover';
import { TagChip } from './TagChip';
import { tagColor } from '../lib/tags';
import styles from './TagFilter.module.css';

export function TagFilter() {
  const tags = useAllTags();
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
      {tagFilter !== null && <TagChip tag={tagFilter} hash onRemove={() => setTagFilter(null)} />}
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
        <span>Filter</span>
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
                  <span className={styles.dot} style={{ background: tagColor(tag) }} />
                  <span className={styles.name}>#{tag}</span>
                  <span className={styles.count}>{count}</span>
                  <Check size={13} strokeWidth={2} className={styles.check} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Popover>
    </div>
  );
}
