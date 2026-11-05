import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useIsPresent,
  useReducedMotion,
  type MotionProps,
  type TargetAndTransition,
} from 'framer-motion';
import { CalendarClock, ChevronRight, GripVertical, Plus, StickyNote, Trash2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { startsLabel, type DeadlineBucket } from '../lib/dates';
import { popDelays } from '../hooks/useCompletionHold';
import { useIsPhone } from '../hooks/useMediaQuery';
import { useIsTouch } from '../hooks/useIsTouch';
import { addSubtask } from '../lib/addSubtask';
import { splitTitleLinks } from '../lib/links';
import { ignoreTextEntry } from '../lib/textEntry';
import { primeKeyboard } from '../lib/focusProxy';
import { rowControls, TEXT_ENTRY, toggleKeepingFocus } from '../hooks/useHotkeys';
import { getDescendants, hiddenUntilStart } from '../lib/tree';
import { isContextOnly, neighborAfterRemoval, taskPath, visibleOrder } from '../lib/views';
import {
  useColorSource,
  useEffectiveColor,
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
import { DifficultyIcon } from './DifficultyIcon';
import { DuePill } from './DuePill';
import { LinkChip } from './LinkChip';
import { RescheduleMenu } from './RescheduleMenu';
import { Sparks } from './Sparks';
import { TagChip } from './TagChip';
import { TaskNote, type NoteMode } from './TaskNote';
import { TaskMenu } from './TaskMenu';
import { StrikeText } from './StrikeText';
import { SwipeRow } from './SwipeRow';
import styles from './TaskItem.module.css';
import { TitleEditor } from './TitleEditor';
import { dur, ease, spring } from '../styles/motion';
import { useToday } from '../hooks/useToday';

type Props = {
  id: string;
  depth: number;
  /** Deadline view: no chevron, no children, no indent; shows the ancestor path instead. */
  flat?: boolean;
  /** Tree view: one char per ancestor level ('f' first, 'l' last, 'b' both, 'n' neither). */
  guides?: string;
  /** Sortable bindings for the drag handle; absent where rows aren't draggable. */
  drag?: RowDrag;
  /**
   * How a done row leaves the list. 'pop' (Tree): strike, shrink, pop, collapse, because a
   * completed task is filed away. 'move' (By deadline): a done row is only reordered into the
   * Completed section, so if it does leave (that section is collapsed, or past its preview) it
   * just fades out.
   */
  exitStyle?: 'pop' | 'move';
  /**
   * Deadline view: the section this row sits under. Today and Tomorrow already say when, so a
   * row there shows no date (just the repeat icon); Next 7 days shows only the weekday.
   */
  section?: DeadlineBucket;
  /**
   * Today view: why the row is there, when that adds anything ("Overdue \u00b7 Oct 18", "From
   * Mon"). A danger reason replaces the due pill, since it already says the date.
   */
  reason?: string;
  reasonDanger?: boolean;
  /** Today view: this planned row pushes the day over capacity (tinted). */
  over?: boolean;
  /** Week view: the row is a plan for this day, not its due date (hollow marker, muted title). */
  quiet?: boolean;
  /**
   * Week view: a narrow column. The title wraps, the hover actions shrink to the ⋯ menu and the
   * "large task" nudge is left out.
   */
  compact?: boolean;
  /** Shared-layout id, so a Suggested row can glide into the list as this one. */
  layoutId?: string;
  /** Tree view: the row is a treeitem in TaskList's `role="tree"`; elsewhere it is a group. */
  tree?: boolean;
};

export type RowDrag = Pick<
  ReturnType<typeof useSortable>,
  'setNodeRef' | 'setActivatorNodeRef' | 'attributes' | 'listeners'
> & {
  /** Show the handle (tree view, no tag filter). */
  enabled: boolean;
  style: CSSProperties;
  /** The handle's verb: "Reorder" in the Tree, "Move" in Week (between days). */
  verb?: string;
};

const NO_PATH: string[] = [];
const MAX_TAGS_SHOWN = 3;
const MAX_TAGS_SHOWN_PHONE = 2;
const MAX_LINKS_SHOWN = 2;
const SHAKE_X = [0, -7, 7, -5, 5, -2, 0];
const SHAKE_SECONDS = 0.38;

/** Shared micro-interaction for icon buttons. */
const iconMotion: MotionProps = {
  whileHover: { scale: 1.08 },
  whileTap: { scale: 0.9 },
  transition: spring.pop,
};

/** Beats of a completed row's exit, in seconds: shrink, then pop, then the height collapse. */
export const SHRINK_S = 0.22;
export const POP_S = 0.14;
export const COLLAPSE_S = dur.base;
const SHRINK_EASE = ease.inOut;

const DELETE_EXIT: TargetAndTransition = {
  opacity: 0,
  x: -12,
  height: 0,
  overflow: 'hidden',
  transition: { duration: dur.base },
};

const MOVE_EXIT: TargetAndTransition = {
  opacity: 0,
  height: 0,
  overflow: 'hidden',
  transition: { duration: dur.base, ease: ease.out },
};

/** A row leaves because it was completed (it still exists, done) or because it was deleted. */
const isCompleted = (id: string) => useTaskStore.getState().tasks[id]?.done === true;

/**
 * The row's own exit. A deleted row keeps the shake-then-slide; a completed one waits for its
 * turn in the cascade (`popDelays`), lets its content shrink and pop (see `contentExit`), then
 * collapses so the rows below glide up. Reduced motion is a short plain fade.
 */
function rowExit(
  id: string,
  reduced: boolean | null,
  exitStyle: 'pop' | 'move',
): TargetAndTransition {
  if (!isCompleted(id)) return DELETE_EXIT;
  if (exitStyle === 'move') return MOVE_EXIT;
  if (reduced) return { opacity: 0, height: 0, transition: { duration: 0.15 } };
  const wait = (popDelays.get(id) ?? 0) + SHRINK_S + POP_S;
  return { height: 0, transition: { duration: COLLAPSE_S, delay: wait, ease: SHRINK_EASE } };
}

/** Beats 2 and 3 on the inner content: scale 1 -> 0.94 -> 1.03 while it fades out. */
function contentExit(
  id: string,
  reduced: boolean | null,
  exitStyle: 'pop' | 'move',
): TargetAndTransition {
  if (!isCompleted(id) || reduced || exitStyle === 'move') return {};
  return {
    scale: [1, 0.94, 1.03],
    opacity: [1, 0.85, 0],
    transition: {
      duration: SHRINK_S + POP_S,
      delay: popDelays.get(id) ?? 0,
      times: [0, SHRINK_S / (SHRINK_S + POP_S), 1],
      ease: [SHRINK_EASE, ease.out],
    },
  };
}

const ENTER = { ...spring.snappy, layout: spring.layout } as const;

function TaskItemInner({
  id,
  depth,
  flat = false,
  guides = '',
  drag,
  exitStyle = 'pop',
  section,
  reason,
  reasonDanger = false,
  over = false,
  quiet = false,
  compact = false,
  layoutId,
  tree = false,
}: Props) {
  const liveTask = useTask(id);
  const liveLeaf = useIsLeaf(id);
  const liveSum = useEffectiveDifficulty(id);
  const liveColor = useEffectiveColor(id);
  const colorSource = useColorSource(id).source;
  const liveProgress = useProgress(id);
  const editing = useTaskStore((s) => s.editingId === id);
  const focused = useUIStore((s) => s.focusedId === id);
  const tabStop = useUIStore((s) => s.tabStopId === id);
  const deleteRequested = useUIStore((s) => s.deleteRequestId === id);
  const rescheduleRequested = useUIStore((s) => s.rescheduleRequestId === id);
  const revealPulse = useUIStore((s) => (s.revealFlash?.id === id ? s.revealFlash.n : 0));
  const delay = useToggleDelay(id);
  const reduced = useReducedMotion();
  const dragging = useDragStore((s) => s.activeId === id);
  const anyDragging = useDragStore((s) => s.activeId !== null);
  const touch = useIsTouch();
  const phone = useIsPhone();
  const hidden = useDragStore((s) => s.hiddenIds.has(id));
  const layoutOff = useDragStore((s) => s.layoutOff);
  const tagFilter = useUIStore((s) => s.tagFilter);
  const setTagFilter = useUIStore((s) => s.setTagFilter);
  const dimmed = useTaskStore(
    (s) => !flat && tagFilter !== null && isContextOnly(s, id, tagFilter),
  );
  const showUpcoming = useUIStore((s) => s.showUpcoming);
  const today = useToday();
  // Only in the Tree, with "Show" pressed on its footer: a task that starts later (or sits under
  // one) is dimmed, and its own row says when it starts.
  const upcoming = useTaskStore((s) => showUpcoming && !flat && hiddenUntilStart(s, id, today));
  const path = useTaskStore(useShallow((s) => (flat ? taskPath(s, id) : NO_PATH)));
  /** The note under the title: shut, shown read-only (links as chips) or being edited. */
  const [noteMode, setNoteMode] = useState<NoteMode>('closed');
  // Phones carry no ⋯ on the row: the title editor's ⋯ opens the options sheet instead.
  const [menuOpen, setMenuOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  /** What the Reschedule menu hangs off: the hover button, the swipe's Later button or the row. */
  const rescheduleAnchor = useRef<HTMLElement | null>(null);
  const closeReschedule = useCallback(() => setRescheduleOpen(false), []);
  const [confirm, setConfirm] = useState<{ open: boolean; count: number }>({
    open: false,
    count: 0,
  });
  const closeConfirm = useCallback(() => setConfirm((c) => ({ ...c, open: false })), []);
  const deleting = useRef(false);
  const pulse = useAnimationControls();
  const tint = useAnimationControls();
  const rowRef = useRef<HTMLDivElement>(null);
  const liRef = useRef<HTMLLIElement>(null);
  const present = useIsPresent();
  const [burst, setBurst] = useState<{ x: number; y: number } | null>(null);
  // Leaving because it was completed (not deleted): the content pops and sparks fly.
  const completing = !present && liveTask?.done === true && exitStyle === 'pop';

  // A deleted row stays mounted while AnimatePresence plays its exit, so keep showing its last state.
  const view = {
    task: liveTask,
    leaf: liveLeaf,
    sum: liveSum,
    color: liveColor,
    ...liveProgress,
  };
  const lastView = useRef(view);
  if (liveTask) lastView.current = view;
  const { task, leaf, sum, color, done, total } = liveTask ? view : lastView.current;

  // The sparks burst from the checkbox centre, measured as the exit starts.
  useLayoutEffect(() => {
    if (!completing || reduced) return;
    const li = liRef.current;
    const box = li?.querySelector('[role="checkbox"]')?.getBoundingClientRect();
    const origin = li?.getBoundingClientRect();
    if (box && origin) {
      setBurst({
        x: box.left + box.width / 2 - origin.left,
        y: box.top + box.height / 2 - origin.top,
      });
    }
  }, [completing, reduced]);

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
          const order = visibleOrder(tasks, {
            view: ui.view,
            tag: ui.tagFilter,
            completedCollapsed: ui.completedCollapsed,
            completedShowAll: ui.completedShowAll,
            showUpcoming: ui.showUpcoming,
            weekAnchor: ui.weekAnchor,
          });
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

  /**
   * The row's checkbox and swipe-to-complete. With a row selected, this row becomes the selected
   * one, so a following x or Space acts on it (or on the row that takes its place), never on the
   * row selected before, such as its parent (#74). From the keyboard (or a click, which focuses
   * the button), the focus must not fall to <body> when the completed row leaves the list.
   */
  const toggleHere = useCallback(() => {
    const ui = useUIStore.getState();
    const selected = ui.focusedId !== null;
    if (selected && ui.focusedId !== id) ui.setFocusedId(id);
    if (selected || rowRef.current?.contains(document.activeElement)) toggleKeepingFocus(id);
    else useTaskStore.getState().toggle(id);
  }, [id]);

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

  // The `s` hotkey asks through the store; the menu opens under the row.
  useEffect(() => {
    if (!rescheduleRequested) return;
    useUIStore.getState().clearRescheduleRequest();
    rescheduleAnchor.current = rowRef.current;
    setRescheduleOpen(true);
  }, [rescheduleRequested]);

  useEffect(() => {
    if (focused) rowRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [focused]);

  // Keyboard focus follows the focused row (j/k, a completed row handing on, an edit ending),
  // but only from nowhere or from another row: never out of a field or a dialog.
  useEffect(() => {
    const row = rowRef.current;
    const active = document.activeElement;
    if (!focused || editing || !row || active === row) return;
    const fromRow = active?.closest('[data-row-id]') && !active.closest(TEXT_ENTRY);
    if (active === null || active === document.body || fromRow) row.focus({ preventScroll: true });
  }, [focused, editing]);

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
  // Menus close themselves before calling this; addSubtask primes the iOS keyboard first.
  const addChild = () => void addSubtask(id);

  const dueDisplay =
    section === 'today' || section === 'tomorrow'
      ? 'icon'
      : section === 'week'
        ? 'weekday'
        : 'full';
  const showDue =
    task.dueDate !== null &&
    !(reason && reasonDanger) &&
    (dueDisplay !== 'icon' || task.repeat !== null);
  // A link in the title becomes a chip on the meta line; the title shows the rest of its words.
  // A title that is only a link keeps showing the link itself.
  const { text: linkless, links } = splitTitleLinks(task.title);
  const shownTitle = linkless === '' ? task.title : linkless;
  const chipLinks = linkless === '' ? [] : [...new Set(links)].slice(0, MAX_LINKS_SHOWN);
  const startsLater = upcoming && task.startDate !== null && task.startDate > today;
  const hasNote = task.notes !== undefined;
  const noteOpen = noteMode === 'edit' || (noteMode === 'read' && hasNote);
  const hasTail =
    showDue || !!reason || startsLater || hasNote || chipLinks.length > 0 || task.tags.length > 0;
  const hasMeta = hasTail || (flat && path.length > 0);
  const tagLimit = phone ? MAX_TAGS_SHOWN_PHONE : MAX_TAGS_SHOWN;
  const shownTags = task.tags.slice(0, tagLimit);
  const hiddenTags = task.tags.slice(tagLimit);
  const edit = () => {
    primeKeyboard();
    useTaskStore.getState().setEditingId(id);
  };
  // Menus close themselves before calling this; the editor takes the keyboard the tap primed.
  const editNote = () => {
    primeKeyboard();
    setNoteMode('edit');
  };

  const chevron = (
    <motion.button
      type="button"
      data-press="off"
      className={`${styles.iconBtn} ${styles.chevron}`}
      aria-label={task.collapsed ? 'Expand' : 'Collapse'}
      aria-expanded={!task.collapsed}
      onClick={() => store.update(id, { collapsed: !task.collapsed })}
      tabIndex={-1}
      initial={false}
      animate={{ rotate: task.collapsed ? 0 : 90 }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.9 }}
      transition={spring.snappy}
    >
      <ChevronRight size={15} strokeWidth={1.75} aria-hidden="true" />
    </motion.button>
  );

  return (
    <motion.li
      ref={liRef}
      role={tree ? 'none' : undefined}
      className={styles.item}
      data-completing={completing || undefined}
      style={
        {
          '--depth': depth,
          ...(completing && { '--pop-delay': `${popDelays.get(id) ?? 0}s` }),
        } as CSSProperties
      }
      data-depth={depth}
      data-flat={flat || undefined}
      data-row-id={id}
      data-hidden={hidden || undefined}
      layoutId={layoutId}
      layout="position"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      variants={{ exit: () => rowExit(id, reduced, exitStyle) }}
      exit="exit"
      // While dragging, row moves are the sortable's job: layout animations would fight it.
      transition={layoutOff ? { ...ENTER, layout: { duration: 0 } } : ENTER}
    >
      <motion.div
        className={styles.pop}
        variants={{ exit: () => contentExit(id, reduced, exitStyle) }}
        exit="exit"
      >
        <div
          ref={drag?.setNodeRef}
          className={styles.wrap}
          style={drag?.style}
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
              color={color ?? 'var(--accent)'}
              done={task.done}
              deleteKind={leaf ? 'slide' : 'confirm'}
              onLater={
                task.done
                  ? undefined
                  : (anchor) => {
                      rescheduleAnchor.current = anchor;
                      setRescheduleOpen(true);
                    }
              }
              onComplete={toggleHere}
              onDelete={swipeDelete}
            >
              <motion.div
                ref={rowRef}
                className={`${styles.row} ${task.done ? styles.rowDone : ''} ${editing || noteMode === 'edit' ? styles.rowEditing : ''} ${focused ? styles.rowFocused : ''}`}
                // One Tab stop per row (roving tabindex); its buttons are reached with →.
                role={tree ? 'treeitem' : 'group'}
                tabIndex={tabStop ? 0 : -1}
                aria-label={task.done ? `${task.title}, done` : task.title}
                aria-level={tree ? depth + 1 : undefined}
                aria-expanded={tree && !leaf ? !task.collapsed : undefined}
                aria-selected={tree ? focused : undefined}
                data-row=""
                data-meta={hasMeta || undefined}
                data-dim={dimmed || undefined}
                data-upcoming={upcoming || undefined}
                data-focused={focused || undefined}
                data-over={over || undefined}
                data-quiet={quiet || undefined}
                data-compact={compact || undefined}
                data-row-color={color ?? undefined}
                data-done={(color !== null && task.done) || undefined}
                data-inherited={(color !== null && colorSource === 'parent') || undefined}
                style={color ? ({ '--row-color': color } as CSSProperties) : undefined}
                animate={pulse}
                // Touch: the whole row is the drag handle, picked up with a long press. Events from
                // text fields inside it (the title editor) must never reach the sensors.
                {...(touch && drag?.enabled ? ignoreTextEntry(drag.listeners) : {})}
                onClick={(e) => {
                  // A click on the row itself (not a button, input or link inside it) focuses it.
                  if (
                    (e.target as Element).closest(
                      'button, input, textarea, a, [role="checkbox"], [role="radio"]',
                    )
                  ) {
                    return;
                  }
                  useUIStore.getState().setFocusedId(id);
                }}
                onFocus={(e) => {
                  // Tabbing onto the row selects it, so the keys act on it.
                  if (e.target === e.currentTarget && !focused) {
                    useUIStore.getState().setFocusedId(id);
                  }
                }}
                onKeyDown={(e) => {
                  // In the row's buttons: ←/→ step through them (← from the first goes back to
                  // the row), Esc goes back to the row. ↑/↓ and the rest are useHotkeys'.
                  const row = rowRef.current;
                  const item = liRef.current;
                  if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey)
                    return;
                  if (!row || !item || useDragStore.getState().activeId !== null) return;
                  const controls = rowControls(item);
                  const at = controls.indexOf(e.target as HTMLElement);
                  if (at === -1) return;
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const next = at + (e.key === 'ArrowRight' ? 1 : -1);
                    (next < 0 ? row : controls[Math.min(next, controls.length - 1)]).focus();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    row.focus();
                  }
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
                  className={styles.tint}
                  initial={{ opacity: 0 }}
                  animate={tint}
                  aria-hidden="true"
                />
                {drag?.enabled && !touch && (
                  <button
                    type="button"
                    ref={drag.setActivatorNodeRef}
                    className={styles.grip}
                    aria-label={`${drag.verb ?? 'Reorder'} ${task.title}`}
                    {...drag.attributes}
                    {...drag.listeners}
                    tabIndex={-1}
                  >
                    <GripVertical size={14} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                )}
                <Checkbox
                  checked={task.done}
                  label={`Done: ${task.title}`}
                  delay={delay}
                  onToggle={toggleHere}
                  tabIndex={-1}
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
                      <TitleEditor
                        id={id}
                        initial={task.title}
                        parentId={task.parentId}
                        onMenu={phone ? () => setMenuOpen(true) : undefined}
                      />
                    ) : (
                      <>
                        <button
                          type="button"
                          className={styles.titleBtn}
                          tabIndex={-1}
                          data-swipe-through
                          onClick={edit}
                        >
                          <StrikeText done={task.done} delay={delay} wrap={compact}>
                            {shownTitle}
                          </StrikeText>
                        </button>
                        {hasTail && (
                          <span className={styles.tail}>
                            {reason && (
                              <span
                                className={styles.reason}
                                data-danger={reasonDanger || undefined}
                              >
                                {reason}
                              </span>
                            )}
                            {startsLater && task.startDate !== null && (
                              <span className={styles.starts} title={`Starts ${task.startDate}`}>
                                {startsLabel(task.startDate, today)}
                              </span>
                            )}
                            {showDue && task.dueDate !== null && (
                              <DuePill
                                dueDate={task.dueDate}
                                done={task.done}
                                repeat={task.repeat}
                                display={dueDisplay}
                              />
                            )}
                            {hasNote && (
                              <button
                                type="button"
                                className={styles.noteBtn}
                                aria-label={noteOpen ? 'Hide note' : 'Show note'}
                                aria-expanded={noteOpen}
                                tabIndex={-1}
                                data-swipe-through
                                onClick={() => setNoteMode(noteOpen ? 'closed' : 'read')}
                              >
                                <StickyNote size={14} strokeWidth={1.75} aria-hidden="true" />
                              </button>
                            )}
                            {chipLinks.map((href) => (
                              <LinkChip key={href} href={href} tabIndex={-1} />
                            ))}
                            {shownTags.map((tag) => (
                              <TagChip
                                key={tag}
                                tag={tag}
                                plain
                                tabIndex={-1}
                                onClick={() => setTagFilter(tag)}
                              />
                            ))}
                            {hiddenTags.length > 0 && (
                              <span className={styles.more} title={hiddenTags.join(', ')}>
                                +{hiddenTags.length}
                              </span>
                            )}
                          </span>
                        )}
                      </>
                    )}
                    {flat && path.length > 0 && (
                      <div className={styles.crumb}>{path.join(' › ')}</div>
                    )}
                  </div>
                  <AnimatePresence initial={false}>
                    {noteOpen && (
                      <TaskNote
                        key="note"
                        id={id}
                        notes={task.notes}
                        mode={noteMode as 'read' | 'edit'}
                        onMode={setNoteMode}
                      />
                    )}
                  </AnimatePresence>
                </div>
                <div className={styles.meta}>
                  {/* Hover actions sit to the left of the trailing cluster, overlaying the row's
                    empty space, so nothing reserves room for them at rest. */}
                  {!phone && (
                    <div className={styles.actions}>
                      {/* Touch reschedules by swipe; the mouse gets a button. A compact row
                        keeps only the ⋯, so the strip doesn't cover its checkbox. */}
                      {!touch && !compact && (
                        <motion.button
                          {...iconMotion}
                          type="button"
                          data-press="off"
                          className={styles.iconBtn}
                          aria-label="Reschedule"
                          aria-haspopup="dialog"
                          aria-expanded={rescheduleOpen}
                          tabIndex={-1}
                          onClick={(e) => {
                            rescheduleAnchor.current = e.currentTarget;
                            setRescheduleOpen(!rescheduleOpen);
                          }}
                        >
                          <CalendarClock size={15} strokeWidth={1.75} aria-hidden="true" />
                        </motion.button>
                      )}
                      <TaskMenu
                        id={id}
                        buttonClassName={styles.iconBtn}
                        motionProps={iconMotion}
                        tabIndex={-1}
                        onAddSubtask={addChild}
                        onNote={editNote}
                        onDelete={requestDelete}
                      />
                      {/* Touch has the menu and swipe-to-delete; the row stays quiet. */}
                      {!touch && !compact && (
                        <>
                          <motion.button
                            {...iconMotion}
                            type="button"
                            data-press="off"
                            className={styles.iconBtn}
                            aria-label="Add subtask"
                            tabIndex={-1}
                            onClick={addChild}
                          >
                            <Plus size={15} strokeWidth={1.75} aria-hidden="true" />
                          </motion.button>
                          <motion.button
                            {...iconMotion}
                            type="button"
                            data-press="off"
                            className={`${styles.iconBtn} ${styles.deleteBtn}`}
                            aria-label="Delete task"
                            tabIndex={-1}
                            onClick={requestDelete}
                          >
                            <Trash2 size={15} strokeWidth={1.75} aria-hidden="true" />
                          </motion.button>
                        </>
                      )}
                    </div>
                  )}
                  {leaf ? (
                    <DifficultyIcon
                      value={task.difficulty}
                      dimmed={task.done}
                      tabIndex={-1}
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
                  {!flat && !leaf && chevron}
                </div>
                {phone && (
                  <TaskMenu
                    id={id}
                    buttonClassName={styles.iconBtn}
                    motionProps={iconMotion}
                    onAddSubtask={addChild}
                    onNote={editNote}
                    onDelete={requestDelete}
                    open={menuOpen}
                    onOpenChange={setMenuOpen}
                    hideTrigger
                  />
                )}
              </motion.div>
            </SwipeRow>

            <AnimatePresence initial={false}>
              {!compact && leaf && !task.done && task.difficulty === MAX_DIFFICULTY && (
                <BreakdownNudge key="nudge" onBreakdown={addChild} tabIndex={-1} />
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
      {completing && burst && !reduced && (
        <Sparks
          seed={id}
          x={burst.x}
          y={burst.y}
          color={color}
          delay={(popDelays.get(id) ?? 0) + SHRINK_S}
        />
      )}
      <RescheduleMenu
        id={id}
        open={rescheduleOpen}
        onClose={closeReschedule}
        anchorRef={rescheduleAnchor}
      />
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

const SHIFT = { duration: dur.base * 1000, easing: `cubic-bezier(${ease.out.join(', ')})` };

type SortableProps = Omit<Props, 'drag' | 'flat' | 'exitStyle'> & { dragEnabled: boolean };

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
      tree
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
