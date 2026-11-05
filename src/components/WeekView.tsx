import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { MOUSE_ACTIVATION, MousePenSensor, TOUCH_ACTIVATION } from '../hooks/dragSensors';
import { addDays, parseISO, weekdayDate } from '../lib/dates';
import { todayReason } from '../lib/todayReason';
import { deadlineList, todayISO } from '../lib/views';
import {
  firstDueFrom,
  weekDays,
  weekDropMove,
  weekRange,
  weekStart,
  type WeekDay,
  type WeekItem,
  type WeekKind,
} from '../lib/week';
import { useDragStore } from '../store/drag';
import { useTask, useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';
import { dur, ease } from '../styles/motion';
import { DragPreview } from './DragPreview';
import { TaskItem } from './TaskItem';
import styles from './WeekView.module.css';
import { useToday } from '../hooks/useToday';

/** What a dragged Week row carries: the task, which of its rows it is, and the day it is on. */
type RowData = { id: string; kind: WeekKind; date: string };

const RELEASE_LAYOUT_MS = 320;
const NO_STYLE = {};

const weekdayShort = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const weekdayLong = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const monthDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

function WeekBar({ start, current, today }: { start: string; current: string; today: string }) {
  const setAnchor = useUIStore((s) => s.setWeekAnchor);
  // The current week is "follow today" (null), so the view stays right past midnight.
  const go = (next: string) => setAnchor(next === current ? null : next);
  const here = start === current;
  return (
    <div className={styles.bar}>
      <h2 className={styles.range} aria-live="polite">
        {weekRange(start, today)}
      </h2>
      <div className={styles.nav} role="group" aria-label="Week">
        {/* Only off the current week; first, so the arrows don't move when it comes and goes. */}
        {!here && (
          <button type="button" className={styles.todayBtn} onClick={() => go(current)}>
            Today
          </button>
        )}
        <button
          type="button"
          className={styles.navBtn}
          aria-label="Previous week"
          onClick={() => go(addDays(start, -7))}
        >
          <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.navBtn}
          aria-label="Next week"
          onClick={() => go(addDays(start, 7))}
        >
          <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/**
 * One row of a day: a due task, or a plan for the day in the quiet style. An open row can be
 * dragged to another day: by its grip with a mouse, by a long press on touch.
 */
function DayRow({ item, date, today }: { item: WeekItem; date: string; today: string }) {
  const task = useTask(item.id);
  // A plan that rolled over from an earlier day says so ("From Mon"), as in Today.
  const reason = task && item.carried ? todayReason(task, today) : null;
  const enabled = task !== undefined && !task.done;
  // An overdue row shows its red due pill, as in Tree, rather than relying on its past day.
  const overdue = enabled && task.dueDate !== null && task.dueDate < today;
  const draggable = useDraggable({
    id: `${item.kind}:${item.id}`,
    data: { id: item.id, kind: item.kind, date } satisfies RowData,
    disabled: !enabled,
  });
  return (
    <TaskItem
      id={item.id}
      depth={0}
      flat
      exitStyle="move"
      drag={{
        enabled,
        setNodeRef: draggable.setNodeRef,
        setActivatorNodeRef: draggable.setActivatorNodeRef,
        attributes: draggable.attributes,
        listeners: draggable.listeners,
        // The row stays put (dimmed); the overlay follows the pointer.
        style: NO_STYLE,
        verb: 'Move',
      }}
      // A due row sits under its date already; a plan keeps its due pill to say when it is due.
      section={item.kind === 'due' && !overdue ? 'today' : undefined}
      quiet={item.kind === 'planned'}
      compact
      reason={reason?.label}
      reasonDanger={reason?.danger}
    />
  );
}

/** The day header's link: By deadline, with the first task due that day (or later) selected. */
function showInDeadline(date: string) {
  const ui = useUIStore.getState();
  const state = useTaskStore.getState();
  const id = firstDueFrom(state.tasks, deadlineList(state, { tag: ui.tagFilter }), date);
  ui.setView('deadline');
  if (id === null) return;
  // A focused row scrolls itself into view once it mounts; the pulse shows where it landed.
  ui.setFocusedId(id);
  ui.flashRow(id);
}

function Day({ day, today }: { day: WeekDay; today: string }) {
  const date = parseISO(day.date);
  const label = `${weekdayLong.format(date)}, ${monthDay.format(date)}`;
  const { setNodeRef, isOver } = useDroppable({ id: day.date });
  return (
    <section
      ref={setNodeRef}
      className={styles.day}
      data-today={day.isToday || undefined}
      data-past={day.date < today || undefined}
      data-over={isOver || undefined}
      data-date={day.date}
      aria-label={label}
      aria-current={day.isToday ? 'date' : undefined}
    >
      <header className={styles.dayHead}>
        <button
          type="button"
          className={styles.dayLink}
          title="Show in By deadline"
          onClick={() => showInDeadline(day.date)}
        >
          <span className={styles.dow}>{weekdayShort.format(date)}</span>
          <span className={styles.date}>{monthDay.format(date)}</span>
        </button>
        <span
          className={styles.points}
          data-zero={day.points === 0 || undefined}
          aria-label={`${day.points} ${day.points === 1 ? 'point' : 'points'}`}
        >
          {day.points} {day.points === 1 ? 'pt' : 'pts'}
        </span>
        <button
          type="button"
          className={styles.add}
          aria-label={`Add a task on ${label}`}
          onClick={() => useUIStore.getState().setComposerDay(day.date)}
        >
          <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </header>
      <ul className={styles.rows}>
        <AnimatePresence initial={false}>
          {day.items.map((item) => (
            <DayRow key={`${item.kind}:${item.id}`} item={item} date={day.date} today={today} />
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

const titleOf = (data: unknown) =>
  useTaskStore.getState().tasks[(data as RowData | undefined)?.id ?? '']?.title ?? 'task';

const announcements: Announcements = {
  onDragStart: ({ active }) => `Picked up “${titleOf(active.data.current)}”.`,
  onDragOver: ({ active, over }) =>
    over
      ? `“${titleOf(active.data.current)}” is over ${weekdayDate(String(over.id))}.`
      : `“${titleOf(active.data.current)}” is not over a day.`,
  // A move is said by the undo toast ("Moved … · Undo"), so this region empties rather than
  // keep a "Dropped … on Tue" that an Undo would make wrong.
  onDragEnd: ({ active, over }) => {
    const row = active.data.current as RowData;
    if (over && weekDropMove(row.kind, row.date, String(over.id), todayISO())) return '';
    return `“${titleOf(row)}” was dropped without moving.`;
  },
  onDragCancel: ({ active }) => `Cancelled. “${titleOf(active.data.current)}” did not move.`,
};

/** The Week view: Monday to Sunday, each day listing the tasks due or planned for it. */
export function WeekView() {
  const tag = useUIStore((s) => s.tagFilter);
  const anchor = useUIStore((s) => s.weekAnchor);
  const tasks = useTaskStore((s) => s.tasks);
  const rootIds = useTaskStore((s) => s.rootIds);
  const today = useToday();
  const current = weekStart(today);
  const start = anchor ?? current;
  const days = useMemo(
    () => weekDays({ tasks, rootIds }, start, today, tag),
    [tasks, rootIds, start, today, tag],
  );
  const empty = days.every((day) => day.items.length === 0);
  const reduced = useReducedMotion();
  const activeId = useDragStore((s) => s.activeId);
  const releaseTimer = useRef<number>();
  const gridRef = useRef<HTMLDivElement>(null);

  // Stacked days (below 1024px): opening the current week starts at today, not at a Monday
  // that may be screens above it. Instant, never smooth. Other weeks open at Monday as before.
  useEffect(() => {
    if (anchor !== null || !window.matchMedia?.('(max-width: 1023px)').matches) return;
    const section = gridRef.current?.querySelector<HTMLElement>('section[data-today]');
    const head = section?.querySelector('header');
    if (!section?.previousElementSibling || !head) return;
    // Onto the header's sticky line on a phone (under the bars), 16px from the top otherwise.
    const pinned = parseFloat(getComputedStyle(head).top);
    const line = Number.isFinite(pinned) ? pinned : 16;
    window.scrollBy({ top: head.getBoundingClientRect().top - line, behavior: 'instant' });
    // Only when the view opens: later edits must not pull the page back to today.
  }, []);

  const sensors = useSensors(
    useSensor(MousePenSensor, { activationConstraint: MOUSE_ACTIVATION }),
    useSensor(TouchSensor, { activationConstraint: TOUCH_ACTIVATION }),
  );

  const finish = useCallback(() => {
    document.body.style.removeProperty('cursor');
    useDragStore.getState().stop();
    // Layout animations stay off while the dropped row settles, as in the Tree.
    window.clearTimeout(releaseTimer.current);
    releaseTimer.current = window.setTimeout(
      () => useDragStore.getState().releaseLayout(),
      RELEASE_LAYOUT_MS,
    );
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(releaseTimer.current);
      document.body.style.removeProperty('cursor');
      useDragStore.setState({ activeId: null, layoutOff: false });
    },
    [],
  );

  const onDragStart = ({ active }: DragStartEvent) => {
    const { id } = active.data.current as RowData;
    window.clearTimeout(releaseTimer.current);
    document.body.style.cursor = 'grabbing';
    // A small haptic cue that the long-press picked the row up (touch only).
    if (window.matchMedia?.('(hover: none)').matches) navigator.vibrate?.(10);
    useDragStore.getState().start(id, new Set());
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    finish();
    if (!over) return;
    const { id, kind, date } = active.data.current as RowData;
    const move = weekDropMove(kind, date, String(over.id), todayISO());
    if (move) useTaskStore.getState().moveToDay(id, move);
  };

  return (
    <div className={styles.week}>
      <WeekBar start={start} current={current} today={today} />
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        accessibility={{ announcements }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={finish}
      >
        <motion.div
          key={start}
          ref={gridRef}
          className={styles.grid}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: dur.base, ease: ease.out }}
        >
          {days.map((day) => (
            <Day key={day.date} day={day} today={today} />
          ))}
        </motion.div>
        <DragOverlay dropAnimation={reduced ? null : undefined}>
          {activeId ? <DragPreview id={activeId} subtasks={0} /> : null}
        </DragOverlay>
      </DndContext>
      {empty && (
        <p className={styles.empty}>
          <CalendarDays size={14} strokeWidth={1.75} aria-hidden="true" />
          {tag === null ? 'Nothing due or planned this week' : `Nothing tagged #${tag} this week`}
        </p>
      )}
    </div>
  );
}
