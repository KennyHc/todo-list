import { memo, useCallback, useState } from 'react';
import {
  useEffectiveDifficulty,
  useIsLeaf,
  useProgress,
  useSortedChildIds,
  useTask,
  useTaskStore,
} from '../store/tasks';
import { MAX_DIFFICULTY } from '../types';
import { BreakdownNudge } from './BreakdownNudge';
import { Checkbox } from './Checkbox';
import { ColorPicker } from './ColorPicker';
import { DifficultyPicker } from './DifficultyPicker';
import { StrikeText } from './StrikeText';
import styles from './TaskItem.module.css';
import { TitleEditor } from './TitleEditor';

type Props = { id: string; depth: number };

function TaskItemInner({ id, depth }: Props) {
  const task = useTask(id);
  const leaf = useIsLeaf(id);
  const childIds = useSortedChildIds(id);
  const sum = useEffectiveDifficulty(id);
  const { done, total } = useProgress(id);
  const editing = useTaskStore((s) => s.editingId === id);
  const [pickerOpen, setPickerOpen] = useState(false);
  const closePicker = useCallback(() => setPickerOpen(false), []);

  if (!task) return null;

  const store = useTaskStore.getState();
  const addChild = () => {
    const s = useTaskStore.getState();
    if (task.collapsed) s.update(id, { collapsed: false });
    s.setEditingId(s.add({ title: '', parentId: id }));
  };

  return (
    <li className={styles.item} data-depth={depth}>
      <div className={`${styles.row} ${task.done ? styles.rowDone : ''}`}>
        <span className={styles.bar} style={{ background: task.color }} />
        {leaf ? (
          <span className={styles.chevronSpacer} />
        ) : (
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.chevron} ${task.collapsed ? '' : styles.open}`}
            aria-label={task.collapsed ? 'Expand' : 'Collapse'}
            aria-expanded={!task.collapsed}
            onClick={() => store.update(id, { collapsed: !task.collapsed })}
          >
            ›
          </button>
        )}
        <Checkbox
          checked={task.done}
          color={task.color}
          label={`Done: ${task.title}`}
          onToggle={() => store.toggle(id)}
        />
        <div className={styles.title}>
          {editing ? (
            <TitleEditor id={id} initial={task.title} parentId={task.parentId} />
          ) : (
            <button
              type="button"
              className={styles.titleBtn}
              onClick={() => useTaskStore.getState().setEditingId(id)}
            >
              <StrikeText done={task.done}>{task.title}</StrikeText>
            </button>
          )}
        </div>
        <div className={styles.meta}>
          {leaf ? (
            <DifficultyPicker
              value={task.difficulty}
              color={task.color}
              onChange={(difficulty) => store.update(id, { difficulty })}
            />
          ) : (
            <span className={styles.summary}>
              <span className={styles.badge}>Σ {sum}</span>
              <span className={styles.progress}>
                {done}/{total}
              </span>
            </span>
          )}
        </div>
        <div className={styles.actions}>
          <div className={styles.pickerAnchor}>
            <button
              type="button"
              className={styles.iconBtn}
              aria-label="Change colour"
              aria-haspopup="dialog"
              aria-expanded={pickerOpen}
              onClick={() => setPickerOpen((o) => !o)}
            >
              <span className={styles.colorDot} style={{ background: task.color }} />
            </button>
            {pickerOpen && (
              <ColorPicker
                value={task.color}
                onChange={(color) => store.update(id, { color })}
                onClose={closePicker}
              />
            )}
          </div>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Add subtask"
            onClick={addChild}
          >
            +
          </button>
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.delete}`}
            aria-label="Delete task"
            onClick={() => store.remove(id)}
          >
            ×
          </button>
        </div>
      </div>

      {leaf && !task.done && task.difficulty === MAX_DIFFICULTY && (
        <BreakdownNudge onBreakdown={addChild} />
      )}

      {childIds.length > 0 && !task.collapsed && (
        <ul className={styles.children}>
          {childIds.map((childId) => (
            <TaskItem key={childId} id={childId} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export const TaskItem = memo(TaskItemInner);
