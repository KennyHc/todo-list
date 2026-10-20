import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useCompletionHold } from '../hooks/useCompletionHold';
import { useSettledOrder } from '../hooks/useSettledOrder';
import { BUCKET_LABELS, deadlineBucket, type DeadlineBucket } from '../lib/dates';
import { completedShown, deadlineList, todayISO } from '../lib/views';
import { useTaskStore, type TaskStore } from '../store/tasks';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../store/ui';
import { EmptyState } from './EmptyState';
import { useSessionStore } from '../store/session';
import { TaskItem } from './TaskItem';
import styles from './DeadlineList.module.css';
import { dur, ease } from '../styles/motion';

const HEADER = 'section:';
const isHeader = (key: string) => key.startsWith(HEADER);
/** The Completed section's header and its "Show all n" row. Neither takes part in the hold. */
const COMPLETED_HEADER = `${HEADER}done`;
const SHOW_ALL = 'more:completed';

/**
 * Open task ids in deadline order, with a section header key ('section:overdue') before each
 * group. Done tasks are the Completed section's business (see `completedIds`).
 */
function sectionKeys(state: TaskStore, tag: string | null): string[] {
  const today = todayISO();
  const keys: string[] = [];
  let last: DeadlineBucket | null = null;
  for (const id of deadlineList(state, { tag })) {
    if (state.tasks[id].done) continue;
    const bucket = deadlineBucket(state.tasks[id], today);
    if (bucket !== last) {
      keys.push(`${HEADER}${bucket}`);
      last = bucket;
    }
    keys.push(id);
  }
  return keys;
}

/** Done task ids, most recently completed first. */
const completedIds = (state: TaskStore, tag: string | null): string[] =>
  deadlineList(state, { tag }).filter((id) => state.tasks[id].done);

/** The section header a row sits under in `keys`. */
function headerBefore(keys: string[], id: string): string[] {
  for (let i = keys.indexOf(id) - 1; i >= 0; i -= 1) if (isHeader(keys[i])) return [keys[i]];
  return [];
}

const FADE = { duration: dur.base, ease: ease.out };

function CompletedHeader({ count, collapsed }: { count: number; collapsed: boolean }) {
  const setCollapsed = useUIStore((s) => s.setCompletedCollapsed);
  return (
    <motion.li
      className={styles.header}
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={FADE}
    >
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed(!collapsed)}
      >
        <ChevronDown
          className={styles.chevron}
          data-collapsed={collapsed || undefined}
          size={14}
          strokeWidth={2}
          aria-hidden="true"
        />
        {`${BUCKET_LABELS.done} \u00b7 ${count}`}
      </button>
    </motion.li>
  );
}

function ShowAll({ count }: { count: number }) {
  const setShowAll = useUIStore((s) => s.setCompletedShowAll);
  return (
    <motion.li
      className={styles.more}
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={FADE}
    >
      <button type="button" className={styles.moreBtn} onClick={() => setShowAll(true)}>
        {`Show all ${count}`}
      </button>
    </motion.li>
  );
}

export function DeadlineList() {
  const tag = useUIStore((s) => s.tagFilter);
  const collapsed = useUIStore((s) => s.completedCollapsed);
  const showAll = useUIStore((s) => s.completedShowAll);
  const celebrate = useSessionStore((s) => s.completedSomething);
  // Headers and ids settle as one list. A just-completed task is held where it was (struck
  // through, with its section header if it was the last one there) until the strike has
  // played; then it is released and, being the same row, glides down into Completed.
  const settled = useSettledOrder(useTaskStore(useShallow((s) => sectionKeys(s, tag))), 700, {
    isAnchor: isHeader,
  });
  const open = useCompletionHold(settled, { holdWith: headerBefore });
  const completedAll = useTaskStore(useShallow((s) => completedIds(s, tag)));

  const holding = new Set(open);
  const completed = completedAll.filter((id) => !holding.has(id));
  const rows = completedShown(completed, collapsed, showAll);
  const shown = [
    ...open,
    ...(completed.length === 0
      ? []
      : [
          COMPLETED_HEADER,
          ...rows,
          ...(!collapsed && rows.length < completed.length ? [SHOW_ALL] : []),
        ]),
  ];

  return (
    <LayoutGroup>
      <ul className={styles.list}>
        <AnimatePresence initial={false}>
          {shown.map((key) => {
            if (key === COMPLETED_HEADER) {
              return <CompletedHeader key={key} count={completed.length} collapsed={collapsed} />;
            }
            if (key === SHOW_ALL) return <ShowAll key={key} count={completed.length} />;
            if (isHeader(key)) {
              return (
                <motion.li
                  key={key}
                  className={styles.header}
                  layout="position"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={FADE}
                >
                  {BUCKET_LABELS[key.slice(HEADER.length) as DeadlineBucket]}
                </motion.li>
              );
            }
            return <TaskItem key={key} id={key} depth={0} flat exitStyle="move" />;
          })}
        </AnimatePresence>
      </ul>
      {shown.length === 0 && tag === null && (
        <div className={styles.allClear}>
          <EmptyState celebrate={celebrate} />
        </div>
      )}
    </LayoutGroup>
  );
}
