import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useCompletionHold } from '../hooks/useCompletionHold';
import { useSettledOrder } from '../hooks/useSettledOrder';
import { BUCKET_LABELS, deadlineBucket, type DeadlineBucket } from '../lib/dates';
import { deadlineList, todayISO } from '../lib/views';
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

/** Task ids in deadline order, with a section header key ('section:overdue') before each group. */
function sectionKeys(state: TaskStore, tag: string | null): string[] {
  const today = todayISO();
  const keys: string[] = [];
  let last: DeadlineBucket | null = null;
  for (const id of deadlineList(state, { tag })) {
    const bucket = deadlineBucket(state.tasks[id], today);
    if (bucket !== last) {
      keys.push(`${HEADER}${bucket}`);
      last = bucket;
    }
    keys.push(id);
  }
  return keys;
}

/** The section header a row sits under in `keys`. */
function headerBefore(keys: string[], id: string): string[] {
  for (let i = keys.indexOf(id) - 1; i >= 0; i -= 1) if (isHeader(keys[i])) return [keys[i]];
  return [];
}

export function DeadlineList() {
  const tag = useUIStore((s) => s.tagFilter);
  const celebrate = useSessionStore((s) => s.completedSomething);
  // Headers and ids settle as one list. A just-completed task (filed in History, so no longer
  // in it) is held, with its section header if it was the last one there, until the strike
  // animation has played.
  const settled = useSettledOrder(useTaskStore(useShallow((s) => sectionKeys(s, tag))), 700, {
    isAnchor: isHeader,
  });
  const shown = useCompletionHold(settled, { holdWith: headerBefore });

  return (
    <LayoutGroup>
      <ul className={styles.list}>
        <AnimatePresence initial={false}>
          {shown.map((key) =>
            isHeader(key) ? (
              <motion.li
                key={key}
                className={styles.header}
                layout="position"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: dur.base, ease: ease.out }}
              >
                {BUCKET_LABELS[key.slice(HEADER.length) as DeadlineBucket]}
              </motion.li>
            ) : (
              <TaskItem key={key} id={key} depth={0} flat />
            ),
          )}
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
