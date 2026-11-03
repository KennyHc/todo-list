import { GripVertical } from 'lucide-react';
import { StrikeText } from './StrikeText';
import { Checkbox } from './Checkbox';
import { useTask } from '../store/tasks';
import styles from './DragPreview.module.css';

type Props = { id: string; subtasks: number };

const noop = () => {};

/** What follows the pointer while a row is being dragged. */
export function DragPreview({ id, subtasks }: Props) {
  const task = useTask(id);
  if (!task) return null;
  return (
    <div className={styles.preview} data-testid="drag-preview">
      <GripVertical className={styles.grip} size={14} strokeWidth={1.75} aria-hidden="true" />
      <Checkbox
        checked={task.done}
        color={task.color}
        label={`Done: ${task.title}`}
        onToggle={noop}
      />
      <span className={styles.title}>
        <StrikeText done={task.done}>{task.title}</StrikeText>
      </span>
      {subtasks > 0 && (
        <span className={styles.pill}>
          +{subtasks} {subtasks === 1 ? 'subtask' : 'subtasks'}
        </span>
      )}
    </div>
  );
}
