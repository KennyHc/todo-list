import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useSettledOrder } from '../hooks/useSettledOrder';
import { BUCKET_LABELS, deadlineBucket, type DeadlineBucket } from '../lib/dates';
import { deadlineList, todayISO } from '../lib/views';
import { useTaskStore, type TaskStore } from '../store/tasks';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../store/ui';
import { TaskItem } from './TaskItem';
import styles from './DeadlineList.module.css';

const HEADER = 'section:';

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

export function DeadlineList() {
  const tag = useUIStore((s) => s.tagFilter);
  // Headers and ids settle as one list, so a just-completed task keeps its place (and its
  // section) until the strike animation has played.
  const shown = useSettledOrder(useTaskStore(useShallow((s) => sectionKeys(s, tag))));

  return (
    <LayoutGroup>
      <ul className={styles.list}>
        <AnimatePresence initial={false}>
          {shown.map((key) =>
            key.startsWith(HEADER) ? (
              <motion.li
                key={key}
                className={styles.header}
                layout="position"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
              >
                {BUCKET_LABELS[key.slice(HEADER.length) as DeadlineBucket]}
              </motion.li>
            ) : (
              <TaskItem key={key} id={key} depth={0} flat />
            ),
          )}
        </AnimatePresence>
      </ul>
    </LayoutGroup>
  );
}
