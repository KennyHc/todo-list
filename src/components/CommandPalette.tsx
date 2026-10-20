import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarClock,
  CheckCheck,
  Copy,
  Download,
  FilterX,
  History,
  Keyboard,
  ListTree,
  Monitor,
  Moon,
  Plus,
  Search,
  Sparkles,
  Sun,
  Tag,
  Undo2,
  Upload,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import { serializeBackup } from '../lib/backup';
import { copyText } from '../lib/clipboard';
import { fuzzyMatch } from '../lib/fuzzy';
import { taskPath } from '../lib/views';
import { revealTask } from '../store/reveal';
import { useAllTags, useTaskStore } from '../store/tasks';
import { useThemeStore } from '../store/theme';
import { useUIStore, type View } from '../store/ui';
import type { Task } from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import { DuePill } from './DuePill';
import { Keys } from './Kbd';
import styles from './CommandPalette.module.css';

const MAX_TASKS = 8;
const MAX_RECENT = 5;

type Command = {
  id: string;
  label: string;
  Icon: LucideIcon;
  /** Shortcut hint, one combination. */
  keys?: string[];
  /** Muted text on the right when there is no shortcut. */
  detail?: string;
  run: () => void;
};

type Row =
  | { kind: 'task'; id: string; task: Task; indices: number[]; path: string }
  | { kind: 'command'; id: string; command: Command; indices: number[] };

type Section = { title: string; rows: Row[] };

const VIEWS: { view: View; label: string; Icon: LucideIcon; key: string }[] = [
  { view: 'tree', label: 'Go to Tree', Icon: ListTree, key: '1' },
  { view: 'deadline', label: 'Go to By deadline', Icon: CalendarClock, key: '2' },
  { view: 'history', label: 'Go to History', Icon: History, key: '3' },
];

/** Renders `text` with the matched characters emphasised. */
function Highlight({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) return <>{text}</>;
  const hit = new Set(indices);
  const parts: ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    const on = hit.has(i);
    let j = i;
    while (j < text.length && hit.has(j) === on) j += 1;
    const chunk = text.slice(i, j);
    parts.push(
      on ? (
        <mark key={i} className={styles.hit}>
          {chunk}
        </mark>
      ) : (
        <span key={i}>{chunk}</span>
      ),
    );
    i = j;
  }
  return <>{parts}</>;
}

function Panel({ onClose, onAskClear }: { onClose: () => void; onAskClear: () => void }) {
  const tasks = useTaskStore((s) => s.tasks);
  const doneCount = useTaskStore((s) => Object.values(s.tasks).filter((t) => t.done).length);
  const undo = useTaskStore((s) => s.undo);
  const tags = useAllTags();
  const tagFilter = useUIStore((s) => s.tagFilter);

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const optionId = (i: number) => `${listId}-${i}`;

  // Hand focus back to what opened the palette, unless a command already moved it elsewhere.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => {
      const now = document.activeElement;
      if (!now || now === document.body || cardRef.current?.contains(now)) {
        opener?.focus?.({ preventScroll: true });
      }
    };
  }, []);

  const commands = useMemo<Command[]>(() => {
    const ui = () => useUIStore.getState();
    const list: Command[] = [
      {
        id: 'new',
        label: 'New task',
        Icon: Plus,
        keys: ['n'],
        run: () => document.getElementById('composer')?.focus(),
      },
      ...VIEWS.map(({ view, label, Icon, key }) => ({
        id: `view-${view}`,
        label,
        Icon,
        keys: [key],
        run: () => ui().setView(view),
      })),
      ...tags.map(({ tag }) => ({
        id: `tag-${tag}`,
        label: `Filter by #${tag}`,
        Icon: Tag,
        run: () => ui().setTagFilter(tag),
      })),
    ];
    if (tagFilter !== null) {
      list.push({
        id: 'tag-clear',
        label: 'Clear tag filter',
        Icon: FilterX,
        run: () => ui().setTagFilter(null),
      });
    }
    const setTheme = useThemeStore.getState().setPref;
    list.push(
      { id: 'theme-light', label: 'Theme: Light', Icon: Sun, run: () => setTheme('light') },
      { id: 'theme-dark', label: 'Theme: Dark', Icon: Moon, run: () => setTheme('dark') },
      { id: 'theme-system', label: 'Theme: System', Icon: Monitor, run: () => setTheme('system') },
    );
    if (doneCount > 0) {
      list.push({
        id: 'clear-completed',
        label: 'Clear completed tasks',
        Icon: CheckCheck,
        run: onAskClear,
      });
    }
    list.push(
      {
        id: 'ai-copy',
        label: 'Copy for AI',
        Icon: Sparkles,
        run: () => ui().setAiDialog('copy'),
      },
      {
        id: 'ai-import',
        label: 'Import from AI\u2026',
        Icon: WandSparkles,
        run: () => ui().setAiDialog('import'),
      },
    );
    list.push(
      {
        id: 'export',
        label: 'Export backup',
        Icon: Download,
        run: () => ui().setAiDialog('export'),
      },
      {
        id: 'backup-copy',
        label: 'Copy backup to clipboard',
        Icon: Copy,
        run: () => {
          const { tasks, rootIds, history, tagColors } = useTaskStore.getState();
          void copyText(serializeBackup({ tasks, rootIds, history, tagColors })).then((ok) =>
            ui().showNotice(ok ? 'Backup copied' : 'Couldn\u2019t copy the backup'),
          );
        },
      },
      {
        id: 'import-paste',
        label: 'Import (paste)',
        Icon: Upload,
        run: () => ui().setAiDialog('paste'),
      },
    );
    if (undo) {
      list.push({
        id: 'undo',
        label: 'Undo',
        Icon: Undo2,
        detail: undo.label,
        run: () => useTaskStore.getState().undoLast(),
      });
    }
    list.push({
      id: 'shortcuts',
      label: 'Keyboard shortcuts',
      Icon: Keyboard,
      keys: ['?'],
      run: () => ui().setSheetOpen(true),
    });
    return list;
  }, [tags, tagFilter, doneCount, undo, onAskClear]);

  const sections = useMemo<Section[]>(() => {
    const q = query.trim();
    const all = Object.values(tasks);
    const toRow = (task: Task, indices: number[]): Row => ({
      kind: 'task',
      id: `task-${task.id}`,
      task,
      indices,
      path: taskPath({ tasks, rootIds: [] }, task.id).join(' › '),
    });
    const commandRows = (matches: { command: Command; indices: number[] }[]): Row[] =>
      matches.map(({ command, indices }) => ({
        kind: 'command',
        id: `cmd-${command.id}`,
        command,
        indices,
      }));

    if (q === '') {
      const recent = all
        .filter((t) => !t.done)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, MAX_RECENT)
        .map((t) => toRow(t, []));
      return [
        { title: 'Recent', rows: recent },
        {
          title: 'Commands',
          rows: commandRows(commands.map((command) => ({ command, indices: [] }))),
        },
      ].filter((s) => s.rows.length > 0);
    }

    const taskHits = all
      .flatMap((task) => {
        const m = fuzzyMatch(q, task.title);
        return m ? [{ task, ...m }] : [];
      })
      .sort((a, b) => b.score - a.score || b.task.createdAt - a.task.createdAt)
      .slice(0, MAX_TASKS)
      .map(({ task, indices }) => toRow(task, indices));
    const commandHits = commands
      .flatMap((command) => {
        const m = fuzzyMatch(q, command.label);
        return m ? [{ command, ...m }] : [];
      })
      .sort((a, b) => b.score - a.score);
    return [
      { title: 'Tasks', rows: taskHits },
      { title: 'Commands', rows: commandRows(commandHits) },
    ].filter((s) => s.rows.length > 0);
  }, [query, tasks, commands]);

  const flat = useMemo(() => sections.flatMap((s) => s.rows), [sections]);
  const activeIndex = Math.min(active, flat.length - 1);

  useEffect(() => {
    document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, flat]);

  const choose = (row: Row | undefined) => {
    if (!row) return;
    if (row.kind === 'task') {
      revealTask(row.task.id);
      return;
    }
    onClose();
    row.command.run();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((activeIndex + step + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      choose(flat[activeIndex]);
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  };

  let index = -1;
  return (
    <motion.div
      className={styles.backdrop}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        ref={cardRef}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        initial={{ opacity: 0, scale: 0.98, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -6 }}
        transition={{ type: 'spring', duration: 0.16, bounce: 0 }}
        onKeyDown={onKeyDown}
      >
        <div className={styles.field}>
          <Search className={styles.searchIcon} size={18} strokeWidth={1.75} aria-hidden="true" />
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            placeholder="Search tasks and commands…"
            aria-label="Search tasks and commands"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={flat.length > 0 ? optionId(activeIndex) : undefined}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
          />
          <kbd className={styles.esc} aria-hidden="true">
            esc
          </kbd>
        </div>
        <div
          ref={listRef}
          id={listId}
          className={styles.results}
          role="listbox"
          aria-label="Results"
        >
          {flat.length === 0 && (
            <p className={styles.empty}>No results for &ldquo;{query.trim()}&rdquo;</p>
          )}
          {sections.map((section) => (
            <div key={section.title} role="group" aria-label={section.title}>
              <div className={styles.section} aria-hidden="true">
                {section.title}
              </div>
              {section.rows.map((row) => {
                index += 1;
                const i = index;
                const on = i === activeIndex;
                return (
                  <div
                    key={row.id}
                    id={optionId(i)}
                    role="option"
                    aria-selected={on}
                    className={`${styles.item} ${on ? styles.itemActive : ''}`}
                    onMouseMove={() => active !== i && setActive(i)}
                    onClick={() => choose(row)}
                  >
                    {row.kind === 'task' ? (
                      <>
                        <span
                          className={`${styles.dot} ${row.task.done ? styles.dotDone : ''}`}
                          aria-hidden="true"
                        />
                        <span
                          className={`${styles.title} ${row.task.done ? styles.titleDone : ''}`}
                        >
                          <Highlight text={row.task.title} indices={row.indices} />
                        </span>
                        {row.path && <span className={styles.path}>{row.path}</span>}
                        {row.task.dueDate !== null && (
                          <DuePill
                            dueDate={row.task.dueDate}
                            done={row.task.done}
                            repeat={row.task.repeat}
                          />
                        )}
                      </>
                    ) : (
                      <>
                        <row.command.Icon
                          className={styles.icon}
                          size={16}
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        <span className={styles.title}>
                          <Highlight text={row.command.label} indices={row.indices} />
                        </span>
                        {row.command.keys ? (
                          <Keys keys={row.command.keys} />
                        ) : (
                          row.command.detail && (
                            <span className={styles.path}>{row.command.detail}</span>
                          )
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

/** ⌘K palette: fuzzy-find any task, or run a command. Mounted once, in App. */
export function CommandPalette() {
  const open = useUIStore((s) => s.paletteOpen);
  const setOpen = useUIStore((s) => s.setPaletteOpen);
  const [confirmClear, setConfirmClear] = useState(false);
  const doneCount = useTaskStore((s) => Object.values(s.tasks).filter((t) => t.done).length);
  const close = useCallback(() => setOpen(false), [setOpen]);
  const askClear = useCallback(() => setConfirmClear(true), []);

  return (
    <>
      {createPortal(
        <AnimatePresence>
          {open && <Panel key="palette" onClose={close} onAskClear={askClear} />}
        </AnimatePresence>,
        document.body,
      )}
      <ConfirmDialog
        open={confirmClear}
        title="Clear completed tasks?"
        body={`This removes ${doneCount} completed task${doneCount === 1 ? '' : 's'} from your list. Your history is kept.`}
        confirmLabel="Clear"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          useTaskStore.getState().clearCompleted();
        }}
      />
    </>
  );
}
