import { AnimatePresence, LayoutGroup } from 'framer-motion';
import { useSettledOrder } from '../hooks/useSettledOrder';
import { useSortedChildIds } from '../store/tasks';
import { TaskItem } from './TaskItem';
import styles from './TaskList.module.css';

export function TaskList() {
  const ids = useSettledOrder(useSortedChildIds(null));
  return (
    <LayoutGroup>
      <ul className={styles.list}>
        <AnimatePresence initial={false}>
          {ids.map((id) => (
            <TaskItem key={id} id={id} depth={0} />
          ))}
        </AnimatePresence>
      </ul>
    </LayoutGroup>
  );
}
