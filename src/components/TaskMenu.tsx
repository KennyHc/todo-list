import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, type MotionProps } from 'framer-motion';
import { Eye, EyeOff, MoreHorizontal, Plus, StickyNote, Sun, SunDim, Trash2 } from 'lucide-react';
import { useIsPhone } from '../hooks/useMediaQuery';
import { weekdayDate } from '../lib/dates';
import { nextOccurrence, repeatPatch, repeatPhrase } from '../lib/recur';
import { todayISO } from '../lib/views';
import type { Task } from '../types';
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
  /** Opens the row's note editor (the menu has closed by then). */
  onNote: () => void;
  onDelete: () => void;
  /**
   * Controlled open state, for a menu opened from somewhere else (the phone's title editor has
   * its own ⋯). Without `onOpenChange` the menu keeps its own state.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Render the sheet only; something else opens it. */
  hideTrigger?: boolean;
};

/**
 * "Plan for today" puts the task in Today without touching its due date; on a task that is
 * there only because it was planned, "Remove from today" takes it out again. A task that is
 * there because it is due (or overdue) is not Today's to give back: no item.
 */
function TodayAction({
  id,
  task,
  act,
}: {
  id: string;
  task: Task;
  act: (fn: () => void) => () => void;
}) {
  const today = todayISO();
  const planned = task.plannedFor !== null && task.plannedFor <= today;
  const due = task.dueDate !== null && task.dueDate <= today;
  if (planned && due) return null;
  const plan = useTaskStore.getState().plan;
  return planned ? (
    <button type="button" className={styles.item} onClick={act(() => plan(id, null))}>
      <SunDim size={16} strokeWidth={1.75} aria-hidden="true" />
      <span>Remove from today</span>
    </button>
  ) : (
    <button type="button" className={styles.item} onClick={act(() => plan(id, today))}>
      <Sun size={16} strokeWidth={1.75} aria-hidden="true" />
      <span>Plan for today</span>
    </button>
  );
}

/** The "more" button and its popover (a sheet on phones): difficulty, tags, due date, colour. */
export function TaskMenu({
  id,
  buttonClassName,
  motionProps,
  onAddSubtask,
  onNote,
  onDelete,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: Props) {
  const task = useTask(id);
  const leaf = useIsLeaf(id);
  const sum = useEffectiveDifficulty(id);
  const colorSource = useColorSource(id);
  const todayView = useTaskStore((s) => s.settings.todayView);
  const phone = useIsPhone();
  const [ownOpen, setOwnOpen] = useState(false);
  const open = onOpenChange ? (controlledOpen ?? false) : ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  /** The "Hide until…" date picker is open in place of the actions. */
  const [hiding, setHiding] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), [setOpen]);
  // Reopens on the actions, not on the date picker.
  useEffect(() => {
    if (!open) setHiding(false);
  }, [open]);
  if (!task) return null;

  const update = useTaskStore.getState().update;
  // The menu (a sheet on phones) closes first so it can't cover what the action reveals.
  const act = (fn: () => void) => () => {
    close();
    fn();
  };
  return (
    <>
      {!hideTrigger && (
        <motion.button
          {...motionProps}
          ref={anchorRef}
          type="button"
          data-press="off"
          className={buttonClassName}
          aria-label="More options"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <MoreHorizontal size={16} strokeWidth={1.75} aria-hidden="true" />
        </motion.button>
      )}
      <Popover
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        label="Task options"
        align="end"
        width={284}
      >
        {/* A phone sheet covers the row, so it names the task it edits. */}
        {phone && <h2 className={styles.title}>{task.title}</h2>}
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
          {hiding ? (
            <>
              <h3 className={styles.heading}>Hide until</h3>
              <DatePicker
                inputLabel="Hide until"
                value={task.startDate}
                onChange={(date) => {
                  // Typing a year passes through 0002, 0020, ...: wait for a real one.
                  if (date === null || date >= '1000-01-01') {
                    close();
                    useTaskStore.getState().hideUntil(id, date);
                  }
                }}
                onPicked={close}
              />
            </>
          ) : (
            <>
              {todayView && !task.done && <TodayAction id={id} task={task} act={act} />}
              <button type="button" className={styles.item} onClick={act(onAddSubtask)}>
                <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>Add subtask</span>
              </button>
              <button type="button" className={styles.item} onClick={act(onNote)}>
                <StickyNote size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>{task.notes === undefined ? 'Add note' : 'Edit note'}</span>
              </button>
              <button type="button" className={styles.item} onClick={() => setHiding(true)}>
                <EyeOff size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>Hide until{'…'}</span>
              </button>
              {task.startDate !== null && (
                <button
                  type="button"
                  className={styles.item}
                  onClick={act(() => useTaskStore.getState().hideUntil(id, null))}
                >
                  <Eye size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span>Show now</span>
                </button>
              )}
              <button
                type="button"
                className={`${styles.item} ${styles.danger}`}
                onClick={act(onDelete)}
              >
                <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>Delete</span>
              </button>
            </>
          )}
        </div>
      </Popover>
    </>
  );
}
