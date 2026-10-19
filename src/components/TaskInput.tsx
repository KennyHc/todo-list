import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, Plus, Tag, X } from 'lucide-react';
import { useIsTouch } from '../hooks/useIsTouch';
import { dueLabel } from '../lib/dates';
import { normalizeTags, parseQuickAdd, tagColor } from '../lib/tags';
import { useAllTags, useTaskStore } from '../store/tasks';
import { DatePicker } from './DatePicker';
import { Popover } from './Popover';
import { TagChip } from './TagChip';
import { TagEditor } from './TagEditor';
import styles from './TaskInput.module.css';

type Panel = 'tag' | 'date' | null;

/** A `#prefix` being typed right before the caret. */
const OPEN_TOKEN = /(^|\s)#([\p{L}\p{N}_-]+)$/u;
const MAX_SUGGESTIONS = 5;
const SLIDE = { type: 'spring', stiffness: 420, damping: 38 } as const;

export function TaskInput({ autoFocus = false }: { autoFocus?: boolean }) {
  const add = useTaskStore((s) => s.add);
  const existing = useAllTags();
  const [value, setValue] = useState('');
  const [caret, setCaret] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [due, setDue] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [active, setActive] = useState(0);
  /** Text before the caret at the moment Escape closed the suggestions. */
  const [dismissed, setDismissed] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const tagBtnRef = useRef<HTMLButtonElement>(null);
  const dateBtnRef = useRef<HTMLButtonElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const listId = useId();
  const closePanel = useCallback(() => setPanel(null), []);

  const isTouch = useIsTouch();
  // First run after sign-in: ready to type. Skipped on touch so the keyboard doesn't pop up.
  useEffect(() => {
    if (autoFocus && !isTouch) inputRef.current?.focus();
  }, [autoFocus, isTouch]);

  const parsed = useMemo(() => parseQuickAdd(value), [value]);
  const allTags = useMemo(() => normalizeTags([...tags, ...parsed.tags]), [tags, parsed.tags]);

  const before = value.slice(0, caret);
  const token = OPEN_TOKEN.exec(before);
  const prefix = token ? token[2].toLowerCase() : null;
  const suggestions = useMemo(
    () =>
      prefix === null
        ? []
        : existing
            .filter((t) => t.tag.startsWith(prefix) && t.tag !== prefix)
            .slice(0, MAX_SUGGESTIONS),
    [existing, prefix],
  );
  const listOpen = suggestions.length > 0 && dismissed !== before;
  const activeIndex = Math.min(active, suggestions.length - 1);
  // Don't preview the half-typed tag while its suggestions are showing.
  const previewTags = listOpen ? allTags.filter((t) => t !== prefix) : allTags;

  // Put the caret back after accepting a suggestion rewrites the value.
  useLayoutEffect(() => {
    if (pendingCaret.current === null) return;
    inputRef.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  });

  const accept = (tag: string) => {
    if (!token) return;
    const start = token.index + token[1].length;
    const head = `${before.slice(0, start)}#${tag} `;
    setValue(head + value.slice(caret));
    setCaret(head.length);
    pendingCaret.current = head.length;
    setActive(0);
  };

  const submit = () => {
    const { title, tags: quickTags } = parsed;
    if (!title) return;
    add({ title, tags: normalizeTags([...tags, ...quickTags]), dueDate: due });
    setValue('');
    setCaret(0);
    setTags([]);
    setDue(null);
    setPanel(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (listOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setActive((activeIndex + step + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        accept(suggestions[activeIndex].tag);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setDismissed(before);
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
  };

  const showToolbar = focused || value !== '' || tags.length > 0 || due !== null || panel !== null;

  return (
    <div className={styles.composer} onFocus={() => setFocused(true)} onBlur={onBlur}>
      <div className={styles.field}>
        <Plus className={styles.icon} size={16} strokeWidth={1.75} aria-hidden="true" />
        <input
          ref={inputRef}
          id="composer"
          className={styles.input}
          value={value}
          placeholder="Add a task…"
          aria-label="New task"
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={listOpen ? `${listId}-${activeIndex}` : undefined}
          autoComplete="off"
          onChange={(e) => {
            setValue(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
            setActive(0);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onKeyDown={onKeyDown}
        />
        {!focused && value === '' ? (
          <kbd className={`${styles.kbd} ${styles.kbdHint}`} aria-hidden="true">
            N
          </kbd>
        ) : (
          <kbd className={`${styles.kbd} ${parsed.title ? styles.kbdOn : ''}`} aria-hidden="true">
            ↵
          </kbd>
        )}
      </div>

      {listOpen && (
        <ul id={listId} role="listbox" aria-label="Matching tags" className={styles.suggest}>
          {suggestions.map(({ tag, count }, i) => (
            <li
              key={tag}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={`${styles.option} ${i === activeIndex ? styles.optionActive : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => accept(tag)}
            >
              <span className={styles.optionDot} style={{ background: tagColor(tag) }} />
              <span className={styles.optionLabel}>#{tag}</span>
              <span className={styles.optionCount}>{count}</span>
            </li>
          ))}
        </ul>
      )}

      <AnimatePresence initial={false}>
        {previewTags.length > 0 && (
          <motion.div
            key="chips"
            className={styles.chipRow}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SLIDE}
            style={{ overflow: 'hidden' }}
          >
            <ul className={styles.chips} aria-label="Tags for this task">
              {previewTags.map((tag) => (
                <li key={tag} className={styles.chipItem}>
                  <TagChip
                    tag={tag}
                    onRemove={
                      tags.includes(tag) ? () => setTags(tags.filter((t) => t !== tag)) : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {showToolbar && (
          <motion.div
            key="toolbar"
            initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
            animate={{ height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }}
            exit={{ height: 0, opacity: 0, overflow: 'hidden' }}
            transition={SLIDE}
          >
            <div className={styles.toolbar}>
              <button
                ref={tagBtnRef}
                type="button"
                className={`${styles.tool} ${tags.length > 0 ? styles.toolSet : ''}`}
                aria-haspopup="dialog"
                aria-expanded={panel === 'tag'}
                onClick={() => setPanel(panel === 'tag' ? null : 'tag')}
              >
                <Tag size={13} strokeWidth={1.75} aria-hidden="true" />
                <span>Tag</span>
                {tags.length > 0 && <span className={styles.count}>{tags.length}</span>}
              </button>

              <span className={`${styles.dateGroup} ${due ? styles.toolSet : ''}`}>
                <button
                  ref={dateBtnRef}
                  type="button"
                  className={`${styles.tool} ${styles.dateBtn}`}
                  aria-haspopup="dialog"
                  aria-expanded={panel === 'date'}
                  onClick={() => setPanel(panel === 'date' ? null : 'date')}
                >
                  <Calendar size={13} strokeWidth={1.75} aria-hidden="true" />
                  <span>{due ? dueLabel(due) : 'Due date'}</span>
                </button>
                {due && (
                  <button
                    type="button"
                    className={styles.clear}
                    aria-label="Clear due date"
                    onClick={() => setDue(null)}
                  >
                    <X size={12} strokeWidth={2} aria-hidden="true" />
                  </button>
                )}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Popover
        open={panel === 'tag'}
        onClose={closePanel}
        anchorRef={tagBtnRef}
        label="Tags"
        width={252}
        sheetOnMobile={false}
      >
        <TagEditor tags={tags} onChange={setTags} autoFocus />
      </Popover>
      <Popover
        open={panel === 'date'}
        onClose={closePanel}
        anchorRef={dateBtnRef}
        label="Due date"
        width={252}
        sheetOnMobile={false}
      >
        <DatePicker value={due} onChange={setDue} onPicked={closePanel} />
      </Popover>
    </div>
  );
}
