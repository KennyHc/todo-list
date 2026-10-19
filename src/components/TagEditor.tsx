import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { normalizeTag, tagColor } from '../lib/tags';
import { useAllTags, useTagColors, useTaskStore } from '../store/tasks';
import { ColorPicker } from './ColorPicker';
import { TagChip } from './TagChip';
import styles from './TagEditor.module.css';

type Props = {
  tags: string[];
  onChange: (tags: string[]) => void;
  autoFocus?: boolean;
  /** Only suggest existing tags once something is typed (keeps small popovers short). */
  compact?: boolean;
  /** Each chip gets a colour dot that opens a swatch row for the tag's colour. */
  colorEdit?: boolean;
};

const MAX_SUGGESTIONS = 6;

/** Current tags as removable chips, an input to add more, and existing tags as suggestions. */
export function TagEditor({ tags, onChange, autoFocus, compact, colorEdit }: Props) {
  const existing = useAllTags();
  const tagColors = useTagColors();
  const [colorTag, setColorTag] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [active, setActive] = useState(-1);
  const listId = useId();

  const prefix = normalizeTag(draft);
  const suggestions = useMemo(
    () =>
      (compact && prefix === '' ? [] : existing)
        .filter((t) => !tags.includes(t.tag) && t.tag.startsWith(prefix))
        .slice(0, MAX_SUGGESTIONS),
    [existing, tags, prefix, compact],
  );

  const add = (raw: string) => {
    const tag = normalizeTag(raw);
    setDraft('');
    setActive(-1);
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (suggestions.length === 0) return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      // -1 is "nothing highlighted", so Enter still adds what was typed.
      setActive((i) => {
        const next = i + step;
        return next >= suggestions.length ? -1 : next < -1 ? suggestions.length - 1 : next;
      });
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const pick = active >= 0 && active < suggestions.length ? suggestions[active].tag : draft;
      add(pick);
    } else if (e.key === 'Tab' && active >= 0 && active < suggestions.length) {
      e.preventDefault();
      add(suggestions[active].tag);
    } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div className={styles.editor}>
      {tags.length > 0 && (
        <ul className={styles.chips} aria-label="Tags">
          <AnimatePresence initial={false}>
            {tags.map((tag) => (
              <motion.li
                key={tag}
                className={styles.chipItem}
                layout
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              >
                <TagChip
                  tag={tag}
                  onRemove={() => onChange(tags.filter((t) => t !== tag))}
                  onColor={
                    colorEdit ? () => setColorTag((c) => (c === tag ? null : tag)) : undefined
                  }
                  colorOpen={colorEdit ? colorTag === tag : undefined}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {colorEdit && colorTag !== null && tags.includes(colorTag) && (
        <div className={styles.colorRow}>
          <p className={styles.colorLabel}>Colour for #{colorTag}</p>
          <ColorPicker
            label={`Colour for #${colorTag}`}
            noneLabel="No colour"
            custom={false}
            value={tagColors[colorTag] ?? null}
            onChange={(hex) => useTaskStore.getState().setTagColor(colorTag, hex)}
          />
          <p className={styles.colorHint}>Applies to every task tagged #{colorTag}.</p>
        </div>
      )}
      <input
        className={styles.input}
        value={draft}
        placeholder="Add a tag…"
        aria-label="Add tag"
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        maxLength={32}
        onChange={(e) => {
          setDraft(e.target.value);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
      />
      <ul id={listId} role="listbox" aria-label="Existing tags" className={styles.suggestions}>
        {suggestions.map(({ tag, count }, i) => (
          <li
            key={tag}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            className={`${styles.option} ${i === active ? styles.optionActive : ''}`}
            // Keep focus in the input so the popover does not lose it.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => add(tag)}
          >
            <span className={styles.optionDot} style={{ background: tagColor(tag) }} />
            <span className={styles.optionLabel}>{tag}</span>
            <span className={styles.optionCount}>{count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
