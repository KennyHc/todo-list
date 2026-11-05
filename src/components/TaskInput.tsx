import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Calendar, CircleHelp, Hourglass, Plus, Repeat as RepeatIcon, Tag, X } from 'lucide-react';
import { useImeEnter } from '../hooks/useImeEnter';
import { useIsTouch } from '../hooks/useIsTouch';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { useIsPhone } from '../hooks/useMediaQuery';
import { dueLabel, weekdayDate } from '../lib/dates';
import { firstOccurrence } from '../lib/recur';
import { parseQuickAdd, SUPPORTS_REPEAT, tokenKey, type QuickToken } from '../lib/quickAdd';
import { normalizeTag, normalizeTags, tagColor } from '../lib/tags';
import { dueStatus, todayISO } from '../lib/views';
import { useAllTags, useTaskStore } from '../store/tasks';
import { useUIStore, useView } from '../store/ui';
import type { Repeat } from '../types';
import { DatePicker } from './DatePicker';
import { DifficultyGlyph } from './DifficultyGlyph';
import { consumeLaunchParams } from '../pwa/newTaskShortcut';
import { Popover } from './Popover';
import { QuickChip } from './QuickChip';
import { SyntaxHint } from './SyntaxHint';
import { TagChip } from './TagChip';
import { TagEditor } from './TagEditor';
import styles from './TaskInput.module.css';
import { dur, ease, spring } from '../styles/motion';

type Panel = 'tag' | 'date' | 'syntax' | null;

/** A `#prefix` being typed right before the caret. */
const OPEN_TOKEN = /(^|\s)#([\p{L}\p{N}_-]+)$/u;
const MAX_SUGGESTIONS = 5;
/** The chip row and toolbar open and close with a height spring, so the list below glides. */
const SLIDE = spring.gentle;
const CHIP_FADE = { duration: dur.fast, ease: ease.out } as const;
const CHIP_HIDDEN = { opacity: 0, scale: 0.96 };
const CHIP_SHOWN = { opacity: 1, scale: 1 };

/** The empty composer cycles through these so the shorthand is discoverable. */
const PLACEHOLDERS = [
  'Add a task…',
  'Pay rent tomorrow #home',
  'Gym every monday',
  'Draft report fri !3',
];
const PLACEHOLDER_EVERY_MS = 4000;
const PLACEHOLDER_FADE_MS = 160;

export function TaskInput({ autoFocus = false }: { autoFocus?: boolean }) {
  const add = useTaskStore((s) => s.add);
  const existing = useAllTags();
  const view = useView();
  const [value, setValue] = useState('');
  const [caret, setCaret] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [due, setDue] = useState<string | null>(null);
  /** The day a Week "+" opened the composer for: the due date unless the text or toolbar says. */
  const [dayDue, setDayDue] = useState<string | null>(null);
  /** A repeat picked from the toolbar; it wins over one typed in the text. */
  const [pickedRepeat, setPickedRepeat] = useState<Repeat | null>(null);
  const [focused, setFocused] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [active, setActive] = useState(0);
  /** Text before the caret at the moment Escape closed the suggestions. */
  const [dismissed, setDismissed] = useState<string | null>(null);
  /** Keys of recognised phrases the user dismissed; they stay in the title as typed. */
  const [ignored, setIgnored] = useState<ReadonlySet<string>>(() => new Set());
  const [phrase, setPhrase] = useState(0);
  const [phraseFading, setPhraseFading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const tagBtnRef = useRef<HTMLButtonElement>(null);
  const dateBtnRef = useRef<HTMLButtonElement>(null);
  const syntaxBtnRef = useRef<HTMLButtonElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const listId = useId();
  const closePanel = useCallback(() => setPanel(null), []);

  const isTouch = useIsTouch();
  const phone = useIsPhone();
  // The phone's composer docks to the bottom edge; lift it above the keyboard while it has focus.
  const keyboard = useKeyboardInset(phone && focused);
  // The docked composer's measured height, as --dock-h on the root: the list's bottom padding
  // and the undo toast clear it however tall it grows (chips, tools, hints).
  const dockRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dock = dockRef.current;
    if (!phone || !dock || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement.style;
    const observer = new ResizeObserver(() =>
      root.setProperty('--dock-h', `${Math.ceil(dock.getBoundingClientRect().height)}px`),
    );
    observer.observe(dock, { box: 'border-box' });
    return () => {
      observer.disconnect();
      root.removeProperty('--dock-h');
    };
  }, [phone]);
  // First run after sign-in: ready to type. Skipped on touch so the keyboard doesn't pop up.
  useEffect(() => {
    if (autoFocus && !isTouch) inputRef.current?.focus();
  }, [autoFocus, isTouch]);

  // Opened from outside (/?new=1, /?add=..., the share target): focus the composer, prefilled
  // when there is text. It is never submitted for the user. The URL is cleaned once read.
  useEffect(() => {
    const { newTask, text } = consumeLaunchParams();
    if (text !== null) {
      setValue(text);
      setCaret(text.length);
      pendingCaret.current = text.length;
    }
    if (newTask || text !== null) inputRef.current?.focus();
  }, []);

  // A Week day's "+": focus the composer, set to that day.
  const composerDay = useUIStore((s) => s.composerDay);
  useEffect(() => {
    if (composerDay === null) return;
    setDayDue(composerDay);
    useUIStore.getState().setComposerDay(null);
    inputRef.current?.focus();
  }, [composerDay]);

  const parsed = useMemo(
    () => parseQuickAdd(value, { ignore: ignored, repeats: SUPPORTS_REPEAT }),
    [value, ignored],
  );
  const allTags = useMemo(() => normalizeTags([...tags, ...parsed.tags]), [tags, parsed.tags]);
  const repeat = pickedRepeat ?? parsed.repeat;

  const reduceMotion = useReducedMotion();
  const cycling = focused && value === '' && !reduceMotion;
  useEffect(() => {
    if (!cycling) {
      setPhrase(0);
      setPhraseFading(false);
      return;
    }
    let swap: ReturnType<typeof setTimeout> | undefined;
    const tick = setInterval(() => {
      setPhraseFading(true);
      swap = setTimeout(() => {
        setPhrase((n) => (n + 1) % PLACEHOLDERS.length);
        setPhraseFading(false);
      }, PLACEHOLDER_FADE_MS);
    }, PLACEHOLDER_EVERY_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(swap);
    };
  }, [cycling]);

  const ignore = (...tokens: QuickToken[]) =>
    setIgnored((prev) => new Set([...prev, ...tokens.map(tokenKey)]));
  const dateToken = parsed.tokens.find((t) => t.kind === 'date');
  const startToken = parsed.tokens.find((t) => t.kind === 'start');
  const difficultyToken = parsed.tokens.find((t) => t.kind === 'difficulty');
  const repeatToken = parsed.tokens.find((t) => t.kind === 'repeat');
  /**
   * The due date the task gets: the picked date, then a date typed in the text, then (for a
   * repeat) its first occurrence, then the Week day it was opened for. A repeat from the text
   * already got that from the parser; one picked from the toolbar overrides it, so the first
   * occurrence is worked out again.
   */
  const dueDate =
    due ??
    (pickedRepeat === null || dateToken !== undefined
      ? parsed.dueDate
      : firstOccurrence(pickedRepeat, todayISO())) ??
    dayDue;
  const tagTokens = parsed.tokens.filter((t) => t.kind === 'tag');

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

  const hasChips =
    previewTags.length > 0 ||
    (dateToken !== undefined && parsed.dueDate !== null) ||
    (startToken !== undefined && parsed.startDate !== null) ||
    difficultyToken !== undefined ||
    (SUPPORTS_REPEAT && repeatToken !== undefined);

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
    const { title, tags: quickTags, difficulty, startDate } = parsed;
    if (!title) return;
    const later = startDate !== null && startDate > todayISO();
    add({
      title,
      tags: normalizeTags([...tags, ...quickTags]),
      dueDate,
      startDate,
      repeat,
      // In Today a new task is planned for today, unless a due date already places it or it
      // starts later (planning it would only make it roll in as "From today" once it starts).
      ...(view === 'today' && dueDate === null && !later && { plannedFor: todayISO() }),
      ...(difficulty !== null && { difficulty }),
    });
    // A task that starts later leaves the lists; say so, so it doesn't look like it vanished.
    if (later) {
      useUIStore.getState().showNotice(`Hidden until ${weekdayDate(startDate)}`);
    }
    setValue('');
    setIgnored(new Set());
    setCaret(0);
    setTags([]);
    setDue(null);
    setDayDue(null);
    setPickedRepeat(null);
    setPanel(null);
  };

  const ime = useImeEnter(() => (listOpen ? accept(suggestions[activeIndex].tag) : submit()));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (ime.intercept(e)) return;
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
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setFocused(false);
    // A Week day's "+" left without typing anything: forget the day.
    if (value === '' && panel === null) setDayDue(null);
  };

  const showToolbar =
    focused ||
    value !== '' ||
    tags.length > 0 ||
    due !== null ||
    dayDue !== null ||
    pickedRepeat !== null ||
    panel !== null;
  const toolbarDue =
    due ?? (pickedRepeat !== null ? dueDate : null) ?? (parsed.dueDate === null ? dayDue : null);

  return (
    <div
      ref={dockRef}
      className={styles.dock}
      data-intro="2"
      data-keyboard={keyboard > 0 || undefined}
      style={keyboard > 0 ? ({ '--kb': `${keyboard}px` } as CSSProperties) : undefined}
    >
      <div className={styles.composer} onFocus={() => setFocused(true)} onBlur={onBlur}>
        <div className={styles.field}>
          <Plus className={styles.icon} size={18} strokeWidth={1.75} aria-hidden="true" />
          <input
            ref={inputRef}
            id="composer"
            className={`${styles.input} ${phraseFading ? styles.phFade : ''}`}
            value={value}
            placeholder={PLACEHOLDERS[phrase]}
            aria-label="New task"
            role="combobox"
            aria-expanded={listOpen}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={listOpen ? `${listId}-${activeIndex}` : undefined}
            autoComplete="off"
            onChange={(e) => {
              setValue(e.target.value);
              if (e.target.value === '') setIgnored(new Set());
              setCaret(e.target.selectionStart ?? e.target.value.length);
              setActive(0);
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
            enterKeyHint="enter"
            onKeyDown={onKeyDown}
            {...ime.handlers}
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
          {hasChips && (
            <motion.div
              key="chips"
              className={styles.chipRow}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={SLIDE}
              style={{ overflow: 'hidden' }}
            >
              <ul className={styles.chips} aria-label="Recognised in this task">
                <AnimatePresence initial={false}>
                  {dateToken && parsed.dueDate && (
                    <motion.li
                      key="date"
                      className={styles.chipItem}
                      initial={CHIP_HIDDEN}
                      animate={CHIP_SHOWN}
                      exit={CHIP_HIDDEN}
                      transition={CHIP_FADE}
                    >
                      <QuickChip
                        icon={<Calendar size={12} strokeWidth={1.75} aria-hidden="true" />}
                        label={dateToken.label}
                        accent={dueStatus(parsed.dueDate, todayISO()) === 'today'}
                        muted={due !== null}
                        title={due !== null ? 'The due date you picked is used instead' : undefined}
                        removeLabel={`Don't treat "${dateToken.raw}" as a due date`}
                        onRemove={() => ignore(dateToken)}
                      />
                    </motion.li>
                  )}
                  {startToken && parsed.startDate && (
                    <motion.li
                      key="start"
                      className={styles.chipItem}
                      initial={CHIP_HIDDEN}
                      animate={CHIP_SHOWN}
                      exit={CHIP_HIDDEN}
                      transition={CHIP_FADE}
                    >
                      <QuickChip
                        icon={<Hourglass size={12} strokeWidth={1.75} aria-hidden="true" />}
                        label={startToken.label}
                        title="Hidden until this day"
                        removeLabel={`Don't treat "${startToken.raw}" as a start date`}
                        onRemove={() => ignore(startToken)}
                      />
                    </motion.li>
                  )}
                  {difficultyToken && parsed.difficulty && (
                    <motion.li
                      key="difficulty"
                      className={styles.chipItem}
                      initial={CHIP_HIDDEN}
                      animate={CHIP_SHOWN}
                      exit={CHIP_HIDDEN}
                      transition={CHIP_FADE}
                    >
                      <QuickChip
                        icon={<DifficultyGlyph value={parsed.difficulty} />}
                        label={String(parsed.difficulty)}
                        title={difficultyToken.label}
                        removeLabel={`Don't treat "${difficultyToken.raw}" as a difficulty`}
                        onRemove={() => ignore(difficultyToken)}
                      />
                    </motion.li>
                  )}
                  {SUPPORTS_REPEAT && repeatToken && repeat && (
                    <motion.li
                      key="repeat"
                      className={styles.chipItem}
                      initial={CHIP_HIDDEN}
                      animate={CHIP_SHOWN}
                      exit={CHIP_HIDDEN}
                      transition={CHIP_FADE}
                    >
                      <QuickChip
                        icon={<RepeatIcon size={12} strokeWidth={1.75} aria-hidden="true" />}
                        label={repeatToken.label}
                        muted={pickedRepeat !== null}
                        title={
                          pickedRepeat !== null
                            ? 'The repeat you picked is used instead'
                            : undefined
                        }
                        removeLabel={`Don't treat "${repeatToken.raw}" as a repeat`}
                        onRemove={() => ignore(repeatToken)}
                      />
                    </motion.li>
                  )}
                  {previewTags.map((tag) => (
                    <motion.li
                      key={`tag:${tag}`}
                      className={styles.chipItem}
                      initial={CHIP_HIDDEN}
                      animate={CHIP_SHOWN}
                      exit={CHIP_HIDDEN}
                      transition={CHIP_FADE}
                    >
                      <TagChip
                        tag={tag}
                        onRemove={() => {
                          setTags(tags.filter((t) => t !== tag));
                          ignore(...tagTokens.filter((t) => normalizeTag(t.raw) === tag));
                        }}
                      />
                    </motion.li>
                  ))}
                </AnimatePresence>
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

                <span className={`${styles.dateGroup} ${toolbarDue ? styles.toolSet : ''}`}>
                  <button
                    ref={dateBtnRef}
                    type="button"
                    className={`${styles.tool} ${styles.dateBtn}`}
                    aria-haspopup="dialog"
                    aria-expanded={panel === 'date'}
                    onClick={() => setPanel(panel === 'date' ? null : 'date')}
                  >
                    {pickedRepeat ? (
                      <RepeatIcon size={13} strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <Calendar size={13} strokeWidth={1.75} aria-hidden="true" />
                    )}
                    <span>{toolbarDue ? dueLabel(toolbarDue) : 'Due date'}</span>
                  </button>
                  {toolbarDue && (
                    <button
                      type="button"
                      className={styles.clear}
                      aria-label="Clear due date"
                      onClick={() => {
                        setDue(null);
                        setDayDue(null);
                        setPickedRepeat(null);
                      }}
                    >
                      <X size={12} strokeWidth={2} aria-hidden="true" />
                    </button>
                  )}
                </span>

                <button
                  ref={syntaxBtnRef}
                  type="button"
                  className={`${styles.tool} ${styles.syntaxBtn}`}
                  aria-label="Typing shortcuts"
                  title="Typing shortcuts"
                  aria-haspopup="dialog"
                  aria-expanded={panel === 'syntax'}
                  onClick={() => setPanel(panel === 'syntax' ? null : 'syntax')}
                >
                  <CircleHelp size={14} strokeWidth={1.75} aria-hidden="true" />
                </button>
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
          width={288}
          sheetOnMobile={false}
        >
          <DatePicker
            value={toolbarDue}
            onChange={(date) => {
              setDue(date);
              if (date === null) {
                setPickedRepeat(null);
                setDayDue(null);
              }
            }}
            onPicked={closePanel}
            repeat={pickedRepeat}
            onRepeatChange={setPickedRepeat}
          />
        </Popover>
        <Popover
          open={panel === 'syntax'}
          onClose={closePanel}
          anchorRef={syntaxBtnRef}
          label="Typing shortcuts"
          align="end"
          width={288}
          sheetOnMobile={false}
        >
          <SyntaxHint />
        </Popover>
      </div>
    </div>
  );
}
