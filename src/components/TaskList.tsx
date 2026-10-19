import { AnimatePresence, LayoutGroup } from 'framer-motion';
import { useSettledOrder } from '../hooks/useSettledOrder';
import { useSortedChildIds, useVisibleTreeIds } from '../store/tasks';
import { useUIStore } from '../store/ui';
import { TaskItem } from './TaskItem';
import styles from './TaskList.module.css';

export function TaskList() {
  const tag = useUIStore((s) => s.tagFilter);
  const visible = useVisibleTreeIds(tag);
  const settled = useSettledOrder(useSortedChildIds(null));
  const ids = visible ? settled.filter((id) => visible.has(id)) : settled;
  return (
    <LayoutGroup>
      <ul className={styles.list}>
        <AnimatePresence initial={false}>
          {ids.map((id) => (
            <TaskItem key={id} id={id} depth={0} visible={visible} />
          ))}
        </AnimatePresence>
      </ul>
    </LayoutGroup>
  );
}
