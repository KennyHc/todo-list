import { useMemo, useState, type CSSProperties } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { Check, History as HistoryIcon, X } from 'lucide-react';
import { normalizeTaskColor } from '../lib/colors';
import { dayHeader, formatTime } from '../lib/dates';
import type { HistoryEntry } from '../lib/history';
import { todayISO } from '../lib/views';
import { useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';
import { ConfirmDialog } from './ConfirmDialog';
import { DuePill } from './DuePill';
import { TagChip } from './TagChip';
import styles from './HistoryList.module.css';

type Ask = { kind: 'completed' | 'history'; open: boolean };

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

function Entry({ entry }: { entry: HistoryEntry }) {
  const setTagFilter = useUIStore((s) => s.setTagFilter);
  const remove = useTaskStore((s) => s.removeHistoryEntry);
  // Entries from before tag colours snapshot the old default blue, which meant "no colour".
  const edge = normalizeTaskColor(entry.color);
  const late = entry.dueDate !== null && todayISO(new Date(entry.completedAt)) > entry.dueDate;
  return (
    <motion.li
      className={styles.entry}
      data-row-color={edge ?? undefined}
      data-done=""
      style={edge ? ({ '--row-color': edge } as CSSProperties) : undefined}
      layout="position"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12, height: 0, overflow: 'hidden', transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
    >
      <span className={styles.check} aria-hidden="true">
        <Check size={12} strokeWidth={3} />
      </span>
      <div className={styles.body}>
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
          <span className={styles.badge}>
            {entry.isParent
              ? `Σ ${entry.difficulty} · ${entry.subtaskCount} subtask${entry.subtaskCount === 1 ? '' : 's'}`
              : `Difficulty ${entry.difficulty}`}
          </span>
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
      </div>
      <time className={styles.time} dateTime={new Date(entry.completedAt).toISOString()}>
        {formatTime(entry.completedAt)}
      </time>
      <button
        type="button"
        className={styles.remove}
        aria-label={`Remove "${entry.title}" from history`}
        onClick={() => remove(entry.id)}
      >
        <X size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </motion.li>
  );
}

export function HistoryList() {
  const history = useTaskStore((s) => s.history);
  const doneCount = useTaskStore((s) => Object.values(s.tasks).filter((t) => t.done).length);
  const clearCompleted = useTaskStore((s) => s.clearCompleted);
  const clearHistory = useTaskStore((s) => s.clearHistory);
  const tag = useUIStore((s) => s.tagFilter);
  const [ask, setAsk] = useState<Ask>({ kind: 'completed', open: false });

  const groups = useMemo(
    () => groupByDay(history.filter((e) => tag === null || e.tags.includes(tag)).reverse()),
    [history, tag],
  );
  const close = () => setAsk((a) => ({ ...a, open: false }));

  const dialog =
    ask.kind === 'completed'
      ? {
          title: 'Clear completed tasks?',
          body: `This removes ${doneCount} completed task${doneCount === 1 ? '' : 's'} from your list. Your history is kept.`,
          confirmLabel: 'Clear',
          run: clearCompleted,
        }
      : {
          title: 'Clear history?',
          body: `This removes ${history.length} ${history.length === 1 ? 'entry' : 'entries'} from your history. Your tasks are not affected.`,
          confirmLabel: 'Clear',
          run: clearHistory,
        };

  return (
    <div className={styles.card}>
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
                    <Entry key={entry.id} entry={entry} />
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          ))}
        </LayoutGroup>
      )}

      {(history.length > 0 || doneCount > 0) && (
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.textBtn}
            disabled={doneCount === 0}
            onClick={() => setAsk({ kind: 'completed', open: true })}
          >
            Clear completed tasks from list
          </button>
          <button
            type="button"
            className={styles.textBtn}
            disabled={history.length === 0}
            onClick={() => setAsk({ kind: 'history', open: true })}
          >
            Clear history
          </button>
        </div>
      )}

      <ConfirmDialog
        open={ask.open}
        title={dialog.title}
        body={dialog.body}
        confirmLabel={dialog.confirmLabel}
        onCancel={close}
        onConfirm={() => {
          close();
          dialog.run();
        }}
      />
    </div>
  );
}
