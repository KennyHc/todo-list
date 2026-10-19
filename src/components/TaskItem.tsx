import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useReducedMotion,
  type MotionProps,
} from 'framer-motion';
import { useSettledOrder } from '../hooks/useSettledOrder';
import { getAncestors } from '../lib/tree';
import {
  useEffectiveDifficulty,
  useIsLeaf,
  useProgress,
  useSortedChildIds,
  useTask,
  useTaskStore,
  useToggleDelay,
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

/** Shared micro-interaction for icon buttons. */
const iconMotion: MotionProps = {
  whileHover: { scale: 1.08 },
  whileTap: { scale: 0.9 },
  transition: { type: 'spring', stiffness: 500, damping: 25 },
};

const ENTER = {
  type: 'spring',
  stiffness: 500,
  damping: 35,
  layout: { type: 'spring', stiffness: 380, damping: 34 },
} as const;

function TaskItemInner({ id, depth }: Props) {
  const liveTask = useTask(id);
  const liveLeaf = useIsLeaf(id);
  const liveChildIds = useSortedChildIds(id);
  const liveSum = useEffectiveDifficulty(id);
  const liveProgress = useProgress(id);
  const editing = useTaskStore((s) => s.editingId === id);
  const delay = useToggleDelay(id);
  const reduced = useReducedMotion();
  const [pickerOpen, setPickerOpen] = useState(false);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  const pulse = useAnimationControls();
  const flash = useAnimationControls();
  const prevDone = useRef(liveTask?.done ?? false);

  // A deleted row stays mounted while AnimatePresence plays its exit, so keep showing its last state.
  const view = {
    task: liveTask,
    leaf: liveLeaf,
    childIds: liveChildIds,
    sum: liveSum,
    ...liveProgress,
  };
  const lastView = useRef(view);
  if (liveTask) lastView.current = view;
  const { task, leaf, childIds, sum, done, total } = liveTask ? view : lastView.current;

  const shownChildIds = useSettledOrder(childIds);
  const done_ = task?.done ?? false;

  // Auto-complete pulse: an ancestor of the toggled task that became done as a result.
  useEffect(() => {
    const wasDone = prevDone.current;
    prevDone.current = done_;
    if (wasDone || !done_ || reduced) return;
    const state = useTaskStore.getState();
    const toggled = state.lastToggle;
    if (!toggled || toggled.id === id || !getAncestors(state, toggled.id).includes(id)) return;
    void pulse.start({
      scale: [1, 1.02, 1],
      transition: { duration: 0.5, delay, ease: 'easeInOut' },
    });
    void flash.start({
      opacity: [0, 0.18, 0],
      transition: { duration: 0.8, delay, times: [0, 0.25, 1], ease: 'easeOut' },
    });
  }, [done_, id, delay, reduced, pulse, flash]);

  if (!task) return null;

  const store = useTaskStore.getState();
  const addChild = () => {
    const s = useTaskStore.getState();
    if (task.collapsed) s.update(id, { collapsed: false });
    s.setEditingId(s.add({ title: '', parentId: id }));
  };

  return (
    <motion.li
      className={styles.item}
      data-depth={depth}
      layout="position"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12, height: 0, overflow: 'hidden', transition: { duration: 0.2 } }}
      transition={ENTER}
    >
      <motion.div className={`${styles.row} ${task.done ? styles.rowDone : ''}`} animate={pulse}>
        <motion.span
          className={styles.flash}
          style={{ background: task.color }}
          initial={{ opacity: 0 }}
          animate={flash}
          aria-hidden="true"
        />
        <span className={styles.bar} style={{ background: task.color }} />
        {leaf ? (
          <span className={styles.chevronSpacer} />
        ) : (
          <motion.button
            type="button"
            className={`${styles.iconBtn} ${styles.chevron}`}
            aria-label={task.collapsed ? 'Expand' : 'Collapse'}
            aria-expanded={!task.collapsed}
            onClick={() => store.update(id, { collapsed: !task.collapsed })}
            initial={false}
            animate={{ rotate: task.collapsed ? 0 : 90 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 26 }}
          >
            ›
          </motion.button>
        )}
        <Checkbox
          checked={task.done}
          color={task.color}
          label={`Done: ${task.title}`}
          delay={delay}
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
              <StrikeText done={task.done} delay={delay}>
                {task.title}
              </StrikeText>
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
            <motion.button
              {...iconMotion}
              type="button"
              className={styles.iconBtn}
              aria-label="Change colour"
              aria-haspopup="dialog"
              aria-expanded={pickerOpen}
              onClick={() => setPickerOpen((o) => !o)}
            >
              <span className={styles.colorDot} style={{ background: task.color }} />
            </motion.button>
            {pickerOpen && (
              <ColorPicker
                value={task.color}
                onChange={(color) => store.update(id, { color })}
                onClose={closePicker}
              />
            )}
          </div>
          <motion.button
            {...iconMotion}
            type="button"
            className={styles.iconBtn}
            aria-label="Add subtask"
            onClick={addChild}
          >
            +
          </motion.button>
          <motion.button
            {...iconMotion}
            type="button"
            className={`${styles.iconBtn} ${styles.delete}`}
            aria-label="Delete task"
            onClick={() => store.remove(id)}
          >
            ×
          </motion.button>
        </div>
      </motion.div>

      <AnimatePresence initial={false}>
        {leaf && !task.done && task.difficulty === MAX_DIFFICULTY && (
          <BreakdownNudge key="nudge" onBreakdown={addChild} />
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {shownChildIds.length > 0 && !task.collapsed && (
          <motion.ul
            key="children"
            className={styles.children}
            initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
            animate={{
              height: 'auto',
              opacity: 1,
              // Only clip while animating, so the colour popover can overflow at rest.
              transitionEnd: { overflow: 'visible' },
            }}
            exit={{ height: 0, opacity: 0, overflow: 'hidden' }}
            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
          >
            <AnimatePresence initial={false}>
              {shownChildIds.map((childId) => (
                <TaskItem key={childId} id={childId} depth={depth + 1} />
              ))}
            </AnimatePresence>
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export const TaskItem = memo(TaskItemInner);
