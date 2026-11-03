import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useReducedMotion,
  type MotionProps,
} from 'framer-motion';
import { ChevronRight, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useIsTouch } from '../hooks/useIsTouch';
import { getAncestors, getDescendants } from '../lib/tree';
import { isContextOnly, neighborAfterRemoval, taskPath, visibleOrder } from '../lib/views';
import {
  useEffectiveDifficulty,
  useIsLeaf,
  useProgress,
  useTask,
  useTaskStore,
  useToggleDelay,
} from '../store/tasks';
import { useDragStore } from '../store/drag';
import { useUIStore } from '../store/ui';
import { MAX_DIFFICULTY } from '../types';
import { BreakdownNudge } from './BreakdownNudge';
import { Checkbox } from './Checkbox';
import { ConfirmDialog } from './ConfirmDialog';
import { DifficultyPicker } from './DifficultyPicker';
import { DuePill } from './DuePill';
import { TagChip } from './TagChip';
import { TaskMenu } from './TaskMenu';
import { StrikeText } from './StrikeText';
import { SwipeRow } from './SwipeRow';
import styles from './TaskItem.module.css';
import { TitleEditor } from './TitleEditor';

type Props = {
  id: string;
  depth: number;
  /** Deadline view: no chevron, no children, no indent; shows the ancestor path instead. */
  flat?: boolean;
  /** Tree view: one char per ancestor level ('f' first, 'l' last, 'b' both, 'n' neither). */
  guides?: string;
  /** Sortable bindings for the drag handle; absent where rows aren't draggable. */
  drag?: RowDrag;
};

export type RowDrag = Pick<
  ReturnType<typeof useSortable>,
  'setNodeRef' | 'setActivatorNodeRef' | 'attributes' | 'listeners'
> & {
  /** Show the handle (tree view, no tag filter). */
  enabled: boolean;
  style: CSSProperties;
};

const NO_PATH: string[] = [];
const MAX_TAGS_SHOWN = 3;
const SHAKE_X = [0, -7, 7, -5, 5, -2, 0];
const SHAKE_SECONDS = 0.38;

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

function TaskItemInner({ id, depth, flat = false, guides = '', drag }: Props) {
  const liveTask = useTask(id);
  const liveLeaf = useIsLeaf(id);
  const liveSum = useEffectiveDifficulty(id);
  const liveProgress = useProgress(id);
  const editing = useTaskStore((s) => s.editingId === id);
  const focused = useUIStore((s) => s.focusedId === id);
  const deleteRequested = useUIStore((s) => s.deleteRequestId === id);
  const revealPulse = useUIStore((s) => (s.revealFlash?.id === id ? s.revealFlash.n : 0));
  const delay = useToggleDelay(id);
  const reduced = useReducedMotion();
  const dragging = useDragStore((s) => s.activeId === id);
  const anyDragging = useDragStore((s) => s.activeId !== null);
  const touch = useIsTouch();
  const hidden = useDragStore((s) => s.hiddenIds.has(id));
  const layoutOff = useDragStore((s) => s.layoutOff);
  const tagFilter = useUIStore((s) => s.tagFilter);
  const setTagFilter = useUIStore((s) => s.setTagFilter);
  const dimmed = useTaskStore(
    (s) => !flat && tagFilter !== null && isContextOnly(s, id, tagFilter),
  );
  const path = useTaskStore(useShallow((s) => (flat ? taskPath(s, id) : NO_PATH)));
  const [confirm, setConfirm] = useState<{ open: boolean; count: number }>({
    open: false,
    count: 0,
  });
  const closeConfirm = useCallback(() => setConfirm((c) => ({ ...c, open: false })), []);
  const deleting = useRef(false);
  const pulse = useAnimationControls();
  const flash = useAnimationControls();
  const tint = useAnimationControls();
  const rowRef = useRef<HTMLDivElement>(null);
  const prevDone = useRef(liveTask?.done ?? false);

  // A deleted row stays mounted while AnimatePresence plays its exit, so keep showing its last state.
  const view = {
    task: liveTask,
    leaf: liveLeaf,
    sum: liveSum,
    ...liveProgress,
  };
  const lastView = useRef(view);
  if (liveTask) lastView.current = view;
  const { task, leaf, sum, done, total } = liveTask ? view : lastView.current;

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

  /** Shake the row, then remove it so the list's exit animation runs. */
  const runDelete = useCallback(
    async (shake = true) => {
      if (deleting.current) return;
      deleting.current = true;
      try {
        if (shake && !reduced) {
          await Promise.all([
            pulse.start({
              x: SHAKE_X,
              transition: { duration: SHAKE_SECONDS, ease: 'easeInOut' },
            }),
            tint.start({
              opacity: [0, 1, 1, 1, 1, 1, 1],
              transition: { duration: SHAKE_SECONDS, ease: 'easeOut' },
            }),
          ]);
        }
        // Keyboard focus moves on to the neighbouring row, so j/k keep working after a delete.
        const ui = useUIStore.getState();
        if (ui.focusedId === id) {
          const tasks = useTaskStore.getState();
          const order = visibleOrder(tasks, { view: ui.view, tag: ui.tagFilter });
          ui.setFocusedId(
            neighborAfterRemoval(order, id, new Set([id, ...getDescendants(tasks, id)])),
          );
        }
        useTaskStore.getState().remove(id);
      } finally {
        deleting.current = false;
      }
    },
    [id, reduced, pulse, tint],
  );

  const requestDelete = useCallback(() => {
    if (deleting.current) return;
    const count = getDescendants(useTaskStore.getState(), id).length;
    if (count > 0) setConfirm({ open: true, count });
    else void runDelete();
  }, [id, runDelete]);

  /** Swipe-to-delete: the gesture is the confirmation for a leaf, so no shake; parents still ask. */
  const swipeDelete = useCallback(() => {
    const count = getDescendants(useTaskStore.getState(), id).length;
    if (count > 0) setConfirm({ open: true, count });
    else void runDelete(false);
  }, [id, runDelete]);

  // The Delete hotkey asks through the store, so it takes the same path as the delete button.
  useEffect(() => {
    if (!deleteRequested) return;
    useUIStore.getState().clearDeleteRequest();
    requestDelete();
  }, [deleteRequested, requestDelete]);

  useEffect(() => {
    if (focused) rowRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [focused]);

  // Revealed from the palette: the row may only just have mounted under a still-expanding
  // parent, so scroll again once it has settled.
  useEffect(() => {
    if (revealPulse === 0) return;
    const timer = window.setTimeout(
      () => rowRef.current?.scrollIntoView?.({ block: 'nearest' }),
      260,
    );
    return () => window.clearTimeout(timer);
  }, [revealPulse]);

  if (!task) return null;

  const store = useTaskStore.getState();
  const addChild = () => {
    const s = useTaskStore.getState();
    if (task.collapsed) s.update(id, { collapsed: false });
    s.setEditingId(s.add({ title: '', parentId: id }));
  };

  const shownTags = task.tags.slice(0, MAX_TAGS_SHOWN);
  const hiddenTags = task.tags.slice(MAX_TAGS_SHOWN);
  const edit = () => useTaskStore.getState().setEditingId(id);

  return (
    <motion.li
      className={styles.item}
      data-depth={depth}
      data-flat={flat || undefined}
      data-row-id={id}
      data-hidden={hidden || undefined}
      layout="position"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12, height: 0, overflow: 'hidden', transition: { duration: 0.2 } }}
      // While dragging, row moves are the sortable's job: layout animations would fight it.
      transition={layoutOff ? { ...ENTER, layout: { duration: 0 } } : ENTER}
    >
      <div
        ref={drag?.setNodeRef}
        className={styles.wrap}
        style={{ ...drag?.style, '--depth': depth } as CSSProperties}
        data-dragging={dragging || undefined}
      >
        {guides.split('').map((flag, level) => (
          <span
            key={level}
            className={`${styles.guide} ${flag === 'f' || flag === 'b' ? styles.guideFirst : ''} ${flag === 'l' || flag === 'b' ? styles.guideLast : ''}`}
            style={{ '--level': level } as CSSProperties}
            aria-hidden="true"
          />
        ))}
        <div className={styles.stack}>
          <SwipeRow
            enabled={touch && !editing && !anyDragging && !dragging}
            color={task.color}
            done={task.done}
            deleteKind={leaf ? 'slide' : 'confirm'}
            onComplete={() => useTaskStore.getState().toggle(id)}
            onDelete={swipeDelete}
          >
            <motion.div
              ref={rowRef}
              className={`${styles.row} ${task.done ? styles.rowDone : ''} ${editing ? styles.rowEditing : ''} ${focused ? styles.rowFocused : ''}`}
              data-dim={dimmed || undefined}
              data-focused={focused || undefined}
              animate={pulse}
              onClick={(e) => {
                // A click on the row itself (not a button, input or link inside it) focuses it.
                if (
                  (e.target as Element).closest(
                    'button, input, a, [role="checkbox"], [role="radio"]',
                  )
                ) {
                  return;
                }
                useUIStore.getState().setFocusedId(id);
              }}
            >
              {revealPulse > 0 && (
                // Keyed on the pulse so a repeat reveal replays the CSS animation.
                <span
                  key={revealPulse}
                  className={styles.reveal}
                  aria-hidden="true"
                  onAnimationEnd={() =>
                    useUIStore.setState((s) =>
                      s.revealFlash?.n === revealPulse ? { revealFlash: null } : s,
                    )
                  }
                />
              )}
              <motion.span
                className={styles.flash}
                style={{ background: task.color }}
                initial={{ opacity: 0 }}
                animate={flash}
                aria-hidden="true"
              />
              <motion.span
                className={styles.tint}
                initial={{ opacity: 0 }}
                animate={tint}
                aria-hidden="true"
              />
              {drag?.enabled && (
                <button
                  type="button"
                  ref={drag.setActivatorNodeRef}
                  className={styles.grip}
                  aria-label={`Reorder ${task.title}`}
                  {...drag.attributes}
                  {...drag.listeners}
                >
                  <GripVertical size={14} strokeWidth={1.75} aria-hidden="true" />
                </button>
              )}
              {flat ? null : leaf ? (
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
                  <ChevronRight size={15} strokeWidth={1.75} aria-hidden="true" />
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
                <div
                  className={styles.titleLine}
                  // Blank space after the title edits it, like the title itself.
                  onClick={(e) => {
                    if (!editing && e.target === e.currentTarget) edit();
                  }}
                >
                  {editing ? (
                    <TitleEditor id={id} initial={task.title} parentId={task.parentId} />
                  ) : (
                    <>
                      <button
                        type="button"
                        className={styles.titleBtn}
                        data-swipe-through
                        onClick={edit}
                      >
                        <StrikeText done={task.done} delay={delay}>
                          {task.title}
                        </StrikeText>
                      </button>
                      {(task.tags.length > 0 || task.dueDate !== null) && (
                        <span className={styles.tail}>
                          {shownTags.map((tag) => (
                            <TagChip key={tag} tag={tag} onClick={() => setTagFilter(tag)} />
                          ))}
                          {hiddenTags.length > 0 && (
                            <span className={styles.more} title={hiddenTags.join(', ')}>
                              +{hiddenTags.length}
                            </span>
                          )}
                          {task.dueDate !== null && (
                            <DuePill dueDate={task.dueDate} done={task.done} />
                          )}
                        </span>
                      )}
                    </>
                  )}
                </div>
                {flat && path.length > 0 && <div className={styles.crumb}>{path.join(' › ')}</div>}
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
                <TaskMenu id={id} buttonClassName={styles.iconBtn} motionProps={iconMotion} />
                <motion.button
                  {...iconMotion}
                  type="button"
                  className={styles.iconBtn}
                  aria-label="Add subtask"
                  onClick={addChild}
                >
                  <Plus size={15} strokeWidth={1.75} aria-hidden="true" />
                </motion.button>
                <motion.button
                  {...iconMotion}
                  type="button"
                  className={`${styles.iconBtn} ${styles.deleteBtn}`}
                  aria-label="Delete task"
                  onClick={requestDelete}
                >
                  <Trash2 size={15} strokeWidth={1.75} aria-hidden="true" />
                </motion.button>
              </div>
            </motion.div>
          </SwipeRow>

          <AnimatePresence initial={false}>
            {leaf && !task.done && task.difficulty === MAX_DIFFICULTY && (
              <BreakdownNudge key="nudge" flat={flat} onBreakdown={addChild} />
            )}
          </AnimatePresence>
        </div>
      </div>
      <ConfirmDialog
        open={confirm.open}
        title={`Delete "${task.title}"?`}
        body={`This will also delete ${confirm.count} subtask${confirm.count === 1 ? '' : 's'}.`}
        onCancel={closeConfirm}
        onConfirm={() => {
          closeConfirm();
          void runDelete();
        }}
      />
    </motion.li>
  );
}

export const TaskItem = memo(TaskItemInner);

const SHIFT = { duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' };

type SortableProps = Omit<Props, 'drag' | 'flat'> & { dragEnabled: boolean };

function SortableTaskItemInner({ dragEnabled, ...props }: SortableProps) {
  const reduced = useReducedMotion();
  // Descendants of the dragged row are hidden and take no part in the sort.
  const hidden = useDragStore((s) => s.hiddenIds.has(props.id));
  const sortable = useSortable({
    id: props.id,
    disabled: !dragEnabled || hidden,
    // The drop animation and the row's own layout handle the landing.
    animateLayoutChanges: () => false,
    transition: reduced ? null : SHIFT,
  });
  return (
    <TaskItemInner
      {...props}
      drag={{
        enabled: dragEnabled,
        setNodeRef: sortable.setNodeRef,
        setActivatorNodeRef: sortable.setActivatorNodeRef,
        attributes: sortable.attributes,
        listeners: sortable.listeners,
        // Translate only: the sort strategy's scale would stretch rows of different heights.
        style: {
          transform: CSS.Translate.toString(sortable.transform),
          transition: sortable.transition,
        },
      }}
    />
  );
}

/** A tree row that can be reordered by its handle. */
export const SortableTaskItem = memo(SortableTaskItemInner);
