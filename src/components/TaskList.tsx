import { useSortedChildIds } from '../store/tasks';
import { TaskItem } from './TaskItem';
import styles from './TaskList.module.css';

export function TaskList() {
  const ids = useSortedChildIds(null);
  return (
    <ul className={styles.list}>
      {ids.map((id) => (
        <TaskItem key={id} id={id} depth={0} />
      ))}
    </ul>
  );
}
