import { useCallback, useRef, useState } from 'react';
import { motion, type MotionProps } from 'framer-motion';
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { weekdayDate } from '../lib/dates';
import { nextOccurrence, repeatPatch, repeatPhrase } from '../lib/recur';
import { todayISO } from '../lib/views';
import {
  useColorSource,
  useEffectiveDifficulty,
  useIsLeaf,
  useTask,
  useTaskStore,
} from '../store/tasks';
import { ColorPicker } from './ColorPicker';
import { DatePicker } from './DatePicker';
import { DifficultyPicker } from './DifficultyPicker';
import { Popover } from './Popover';
import { RepeatPicker } from './RepeatPicker';
import { TagEditor } from './TagEditor';
import styles from './TaskMenu.module.css';

type Props = {
  id: string;
  buttonClassName: string;
  motionProps: MotionProps;
  onAddSubtask: () => void;
  onDelete: () => void;
};

/** The "more" button and its popover (a sheet on phones): difficulty, tags, due date, colour. */
export function TaskMenu({ id, buttonClassName, motionProps, onAddSubtask, onDelete }: Props) {
  const task = useTask(id);
  const leaf = useIsLeaf(id);
  const sum = useEffectiveDifficulty(id);
  const colorSource = useColorSource(id);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  if (!task) return null;

  const update = useTaskStore.getState().update;
  // The menu (a sheet on phones) closes first so it can't cover what the action reveals.
  const act = (fn: () => void) => () => {
    close();
    fn();
  };
  return (
    <>
      <motion.button
        {...motionProps}
        ref={anchorRef}
        type="button"
        data-press="off"
        className={buttonClassName}
        aria-label="More options"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreHorizontal size={16} strokeWidth={1.75} aria-hidden="true" />
      </motion.button>
      <Popover
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        label="Task options"
        align="end"
        width={284}
      >
        <div className={styles.sections}>
          <section className={styles.section}>
            <h3 className={styles.heading}>Difficulty</h3>
            {leaf ? (
              <DifficultyPicker
                fill
                value={task.difficulty}
                onChange={(difficulty) => update(id, { difficulty })}
              />
            ) : (
              <p className={styles.note}>Difficulty is the sum of subtasks (Σ {sum})</p>
            )}
          </section>
          <section className={styles.section}>
            <h3 className={styles.heading}>Tags</h3>
            <TagEditor
              compact
              colorEdit
              tags={task.tags}
              onChange={(tags) => update(id, { tags })}
            />
          </section>
          <section className={styles.section}>
            <h3 className={styles.heading}>Due date</h3>
            <DatePicker value={task.dueDate} onChange={(dueDate) => update(id, { dueDate })} />
          </section>
          <section className={styles.section}>
            <h3 className={styles.heading}>Repeat</h3>
            <RepeatPicker
              value={task.repeat}
              onChange={(repeat) => update(id, repeatPatch(task, repeat))}
            />
            {task.repeat !== null && (
              <p className={styles.hint} aria-live="polite">
                {task.dueDate !== null
                  ? `Next: ${weekdayDate(nextOccurrence(task.dueDate, task.repeat, todayISO()))}`
                  : `Repeats ${repeatPhrase(task.repeat)}`}
              </p>
            )}
          </section>
          <section className={styles.section}>
            <h3 className={styles.heading}>Colour</h3>
            <ColorPicker value={task.color} onChange={(color) => update(id, { color })} />
            {task.color === null && (
              <p className={styles.hint}>
                {colorSource.source === 'tag'
                  ? `From #${colorSource.tag}`
                  : colorSource.source === 'parent'
                    ? 'From parent'
                    : 'No colour'}
              </p>
            )}
          </section>
        </div>
        <div className={styles.divider} role="separator" />
        <div className={styles.actions}>
          <button type="button" className={styles.item} onClick={act(onAddSubtask)}>
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>Add subtask</span>
          </button>
          <button
            type="button"
            className={`${styles.item} ${styles.danger}`}
            onClick={act(onDelete)}
          >
            <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>Delete</span>
          </button>
        </div>
      </Popover>
    </>
  );
}
