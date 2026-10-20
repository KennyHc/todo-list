import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { Check, History as HistoryIcon, Minus } from 'lucide-react';
import { normalizeTaskColor } from '../lib/colors';
import { dayHeader, formatTime } from '../lib/dates';
import type { HistoryEntry } from '../lib/history';
import { todayISO } from '../lib/views';
import { useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';
import { MAX_DIFFICULTY, type Difficulty } from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import { DIFFICULTY_NAMES, difficultyAria } from '../lib/difficulty';
import { DifficultyGlyph } from './DifficultyGlyph';
import { DuePill } from './DuePill';
import { TagChip } from './TagChip';
import styles from './HistoryList.module.css';
import { dur, ease, spring } from '../styles/motion';

function groupByDay(entries: HistoryEntry[]): { label: string; entries: HistoryEntry[] }[] {
  const groups: { label: string; entries: HistoryEntry[] }[] = [];
  for (const entry of entries) {
    const label = dayHeader(entry.completedAt);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.entries.push(entry);
    else groups.push({ label, entries: [entry] });
  }
  return groups;
}

/** Why a row is leaving, so its exit can differ: a restored row drifts back toward the Tree. */
const leaving = new Map<string, 'restore' | 'delete'>();

const DELETE_EXIT = {
  opacity: 0,
  x: -12,
  height: 0,
  overflow: 'hidden',
  transition: { duration: dur.base, ease: ease.out },
};
const RESTORE_EXIT = {
  opacity: 0,
  x: 10,
  height: 0,
  overflow: 'hidden',
  transition: { duration: dur.base, ease: ease.out },
};

const STAGGER_S = 0.025;

function Entry({
  entry,
  index,
  editing,
}: {
  entry: HistoryEntry;
  index: number;
  editing: boolean;
}) {
  const reduced = useReducedMotion();
  const setTagFilter = useUIStore((s) => s.setTagFilter);
  const restore = useTaskStore((s) => s.restoreFromHistory);
  const deleteCompleted = useTaskStore((s) => s.deleteCompleted);
  // undefined: the task is gone; false: it was reopened (e.g. a subtask was added); true: done.
  const taskDone = useTaskStore((s) => s.tasks[entry.taskId]?.done);
  // Entries from before tag colours snapshot the old default blue, which meant "no colour".
  const edge = normalizeTaskColor(entry.color);
  const late = entry.dueDate !== null && todayISO(new Date(entry.completedAt)) > entry.dueDate;
  const level = Math.min(MAX_DIFFICULTY, Math.max(1, Math.round(entry.difficulty))) as Difficulty;
  const canRestore = taskDone === true;
  const reason =
    taskDone === undefined
      ? 'This task was deleted'
      : taskDone
        ? undefined
        : 'Already in your list';
  return (
    <motion.li
      className={styles.entry}
      data-row-color={edge ?? undefined}
      data-done=""
      data-editing={editing || undefined}
      style={edge ? ({ '--row-color': edge } as CSSProperties) : undefined}
      layout="position"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      variants={{
        exit: () => (leaving.get(entry.id) === 'restore' ? RESTORE_EXIT : DELETE_EXIT),
      }}
      exit="exit"
      transition={spring.snappy}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked="true"
        aria-label={`Done: ${entry.title}`}
        data-press="off"
        className={styles.check}
        disabled={!canRestore}
        title={reason ?? 'Restore to your list'}
        onClick={() => {
          leaving.set(entry.id, 'restore');
          restore(entry.id);
        }}
      >
        <span className={styles.checkDot} aria-hidden="true">
          <Check size={12} strokeWidth={3} />
        </span>
      </button>
      <motion.div className={styles.body} layout="position">
        <div className={styles.titleLine}>
          <span className={styles.title}>{entry.title}</span>
          {entry.auto && (
            <span className={styles.auto} title="Completed automatically with its subtasks">
              auto
            </span>
          )}
        </div>
        <div className={styles.meta}>
          {entry.path.length > 0 && <span className={styles.crumb}>{entry.path.join(' › ')}</span>}
          {entry.isParent ? (
            <span
              className={styles.badge}
              title={`${entry.subtaskCount} subtask${entry.subtaskCount === 1 ? '' : 's'}, difficulty ${entry.difficulty} in total`}
            >
              Σ {entry.difficulty}
            </span>
          ) : (
            <span
              className={styles.glyph}
              role="img"
              aria-label={difficultyAria(level)}
              title={DIFFICULTY_NAMES[level]}
            >
              <DifficultyGlyph value={level} />
            </span>
          )}
          {entry.tags.map((tag) => (
            <TagChip key={tag} tag={tag} onClick={() => setTagFilter(tag)} />
          ))}
          {entry.dueDate !== null && (
            <span className={styles.due}>
              <DuePill dueDate={entry.dueDate} done />
              {late && <span className={styles.late}>late</span>}
            </span>
          )}
        </div>
      </motion.div>
      <motion.time
        className={styles.time}
        layout="position"
        dateTime={new Date(entry.completedAt).toISOString()}
      >
        {formatTime(entry.completedAt)}
      </motion.time>
      <AnimatePresence initial={false}>
        {editing && (
          <motion.button
            key="delete"
            type="button"
            data-press="off"
            className={styles.minus}
            aria-label={`Delete "${entry.title}" permanently`}
            initial={reduced ? { opacity: 0 } : { opacity: 0, x: 12 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, x: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, x: 12 }}
            transition={
              reduced ? { duration: dur.fast } : { ...spring.snappy, delay: index * STAGGER_S }
            }
            onClick={() => {
              leaving.set(entry.id, 'delete');
              deleteCompleted(entry.id);
            }}
          >
            <span className={styles.minusDot} aria-hidden="true">
              <Minus size={14} strokeWidth={3} />
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export function HistoryList() {
  const history = useTaskStore((s) => s.history);
  const deleteAll = useTaskStore((s) => s.deleteAllCompleted);
  const tag = useUIStore((s) => s.tagFilter);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const groups = useMemo(
    () => groupByDay(history.filter((e) => tag === null || e.tags.includes(tag)).reverse()),
    [history, tag],
  );

  // Nothing left to edit; and Escape leaves edit mode (a dialog or popover keeps its own Escape).
  useEffect(() => {
    if (history.length === 0) setEditing(false);
  }, [history.length]);
  useEffect(() => {
    if (!editing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      setEditing(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editing]);

  let index = 0;
  return (
    <div className={styles.card}>
      {history.length > 0 && (
        <div className={styles.bar}>
          <AnimatePresence initial={false}>
            {editing && (
              <motion.button
                key="all"
                type="button"
                className={`${styles.textBtn} ${styles.danger}`}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: dur.fast, ease: ease.out }}
                onClick={() => setConfirming(true)}
              >
                Delete all
              </motion.button>
            )}
          </AnimatePresence>
          <button
            type="button"
            className={styles.textBtn}
            data-strong
            aria-pressed={editing}
            onClick={() => setEditing((on) => !on)}
          >
            {editing ? 'Done' : 'Edit'}
          </button>
        </div>
      )}
      {groups.length === 0 ? (
        <div className={styles.empty}>
          <HistoryIcon size={18} strokeWidth={1.75} aria-hidden="true" />
          <p className={styles.emptyTitle}>
            {tag === null ? 'No completed tasks yet' : `No completed tasks tagged #${tag}`}
          </p>
          <p className={styles.emptyHint}>Finished tasks show up here, newest first.</p>
        </div>
      ) : (
        <LayoutGroup>
          {groups.map((group) => (
            <section key={group.label} className={styles.group}>
              <h3 className={styles.heading}>{group.label}</h3>
              <ul className={styles.list}>
                <AnimatePresence initial={false}>
                  {group.entries.map((entry) => (
                    <Entry key={entry.id} entry={entry} index={index++} editing={editing} />
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          ))}
        </LayoutGroup>
      )}

      <ConfirmDialog
        open={confirming}
        title="Delete all completed tasks?"
        body={`This permanently deletes ${history.length} completed ${history.length === 1 ? 'task' : 'tasks'} and your whole history. You can undo it right after.`}
        confirmLabel="Delete all"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          setEditing(false);
          deleteAll();
        }}
      />
    </div>
  );
}
