import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type ScreenReaderInstructions,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { AnimatePresence, LayoutGroup, useReducedMotion } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import { MOUSE_ACTIVATION, MousePenSensor, TOUCH_ACTIVATION } from '../hooks/dragSensors';
import { useCompletionHold } from '../hooks/useCompletionHold';
import { useSettledOrder } from '../hooks/useSettledOrder';
import {
  INDENT,
  flattenTree,
  getProjection,
  guideFlags,
  itemsFor,
  projectionTarget,
  withoutDescendants,
  type FlatItem,
  type Projection,
} from '../lib/dnd';
import { getDescendants } from '../lib/tree';
import { useDragStore } from '../store/drag';
import { useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';
import { DragPreview } from './DragPreview';
import { EmptyState } from './EmptyState';
import { useSessionStore } from '../store/session';
import { SortableTaskItem } from './TaskItem';
import { UpcomingFooter } from './UpcomingFooter';
import styles from './TaskList.module.css';
import { useToday } from '../hooks/useToday';

const EXPAND_DELAY = 600;
const RELEASE_LAYOUT_MS = 320;

const instructions: ScreenReaderInstructions = {
  draggable:
    'To pick up a task, press space. Use the up and down arrows to move it, left and right to ' +
    'change its nesting. Press space to drop it, or escape to cancel.',
};

type Session = {
  items: FlatItem[];
  indent: number;
  /** Horizontal offset added by the arrow keys during a keyboard drag. */
  keyboardX: number;
  projection: Projection | null;
};

/** Changes whenever any task's child list does, but not when only done flags change. */
const structureKey = (s: { tasks: Record<string, { childIds: string[] }>; rootIds: string[] }) =>
  s.rootIds.join(',') +
  '|' +
  Object.values(s.tasks)
    .map((t) => t.childIds.join(','))
    .join('|');

export function TaskList() {
  const tag = useUIStore((s) => s.tagFilter);
  const celebrate = useSessionStore((s) => s.completedSomething);
  const reduced = useReducedMotion();
  const activeId = useDragStore((s) => s.activeId);
  const showUpcoming = useUIStore((s) => s.showUpcoming);
  const today = useToday();
  const liveIds = useTaskStore(useShallow((s) => flattenTree(s, { tag, today, showUpcoming })));
  const key = useTaskStore((s) => structureKey(s));
  // Moves apply at once; nothing reorders mid-drag. A just-completed row (already filed in
  // History, so absent from `liveIds`) stays until its strike has played, then pops out.
  const settledIds = useSettledOrder(liveIds, 700, { key, frozen: activeId !== null });
  const ids = useCompletionHold(settledIds);
  const tasks = useTaskStore((s) => s.tasks);
  const items = useMemo(() => itemsFor({ tasks }, ids), [tasks, ids]);
  const guides = useMemo(() => guideFlags(items), [items]);
  const dragEnabled = tag === null;

  const [overId, setOverId] = useState<string | null>(null);
  const [deltaX, setDeltaX] = useState(0);
  const [liveText, setLiveText] = useState('');
  const listRef = useRef<HTMLUListElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const session = useRef<Session>({ items: [], indent: INDENT, keyboardX: 0, projection: null });
  const expandTimer = useRef<number>();
  const releaseTimer = useRef<number>();

  // The rows without the dragged subtree: the sort and the projection only see these.
  const dragItems = useMemo(
    () => (activeId ? withoutDescendants(items, activeId) : items),
    [items, activeId],
  );
  const projection = useMemo(
    () =>
      activeId && overId
        ? getProjection(dragItems, activeId, overId, deltaX, session.current.indent)
        : null,
    [dragItems, activeId, overId, deltaX],
  );
  session.current.items = dragItems;
  session.current.projection = projection;

  const sensors = useSensors(
    useSensor(MousePenSensor, { activationConstraint: MOUSE_ACTIVATION }),
    useSensor(TouchSensor, { activationConstraint: TOUCH_ACTIVATION }),
    useSensor(KeyboardSensor, {
      coordinateGetter: useCallback<KeyboardCoordinateGetter>((event, args) => {
        // Left and right change the nesting by one level, within what the slot allows.
        if (event.code === 'ArrowRight' || event.code === 'ArrowLeft') {
          event.preventDefault();
          const s = session.current;
          const step = event.code === 'ArrowRight' ? 1 : -1;
          const { currentCoordinates } = args;
          const p = s.projection;
          if (p && (step > 0 ? p.depth >= p.maxDepth : p.depth <= p.minDepth)) {
            return currentCoordinates;
          }
          s.keyboardX += step * s.indent;
          return { x: currentCoordinates.x + step * s.indent, y: currentCoordinates.y };
        }
        const next = sortableKeyboardCoordinates(event, args);
        return next ? { x: next.x + session.current.keyboardX, y: next.y } : undefined;
      }, []),
    }),
  );

  const describe = useCallback((p: Projection, id: string, items: FlatItem[]) => {
    const count = items.filter((i) => i.parentId === p.parentId && i.id !== id).length + 1;
    const state = useTaskStore.getState().tasks;
    const where =
      p.parentId === null ? 'at the top level' : `under “${state[p.parentId]?.title ?? ''}”`;
    return `${where}, position ${p.index + 1} of ${count}`;
  }, []);

  const title = (id: string | number) => useTaskStore.getState().tasks[id]?.title ?? 'task';

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up “${title(active.id)}”.`,
    onDragOver: ({ active, over }) => {
      const p = over
        ? getProjection(
            session.current.items,
            String(active.id),
            String(over.id),
            session.current.keyboardX,
            session.current.indent,
          )
        : null;
      return p
        ? `“${title(active.id)}” is now ${describe(p, String(active.id), session.current.items)}.`
        : `“${title(active.id)}” is not over a drop target.`;
    },
    onDragEnd: ({ active, over }) => {
      const p = session.current.projection;
      return over && p
        ? `Dropped “${title(active.id)}” ${describe(p, String(active.id), session.current.items)}.`
        : `“${title(active.id)}” was dropped without moving.`;
    },
    onDragCancel: ({ active }) => `Cancelled. “${title(active.id)}” did not move.`,
  };

  // Announce a nesting change that happens over the same row (Left/Right in keyboard mode).
  const lastOver = useRef<string | null>(null);
  const slotKey = projection ? `${projection.parentId}:${projection.index}` : '';
  useEffect(() => {
    if (!activeId || !projection) {
      lastOver.current = null;
      return;
    }
    if (lastOver.current === overId) {
      setLiveText(describe(projection, activeId, dragItems));
    }
    lastOver.current = overId;
  }, [slotKey]);

  const finish = useCallback(() => {
    window.clearTimeout(expandTimer.current);
    document.body.style.removeProperty('cursor');
    session.current.keyboardX = 0;
    useDragStore.getState().stop();
    setOverId(null);
    setDeltaX(0);
    // Layout animations stay off while the dropped row glides into place.
    window.clearTimeout(releaseTimer.current);
    releaseTimer.current = window.setTimeout(
      () => useDragStore.getState().releaseLayout(),
      RELEASE_LAYOUT_MS,
    );
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(expandTimer.current);
      window.clearTimeout(releaseTimer.current);
      document.body.style.removeProperty('cursor');
      useDragStore.setState({ activeId: null, layoutOff: false });
    },
    [],
  );

  const onDragStart = ({ active }: DragStartEvent) => {
    const id = String(active.id);
    window.clearTimeout(releaseTimer.current);
    const row = listRef.current?.querySelector<HTMLElement>(`[data-row-id="${id}"]`);
    const indent = row ? parseFloat(getComputedStyle(row).getPropertyValue('--indent')) : NaN;
    session.current.indent = indent > 0 ? indent : INDENT;
    session.current.keyboardX = 0;
    document.body.style.cursor = 'grabbing';
    // A small haptic cue that the long-press picked the row up (touch only).
    if (window.matchMedia?.('(hover: none)').matches) navigator.vibrate?.(10);
    setOverId(id);
    setDeltaX(0);
    useDragStore.getState().start(id, new Set(getDescendants(useTaskStore.getState(), id)));
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    setOverId(over ? String(over.id) : null);
    // Hovering a collapsed parent for a moment opens it, so you can drop inside.
    window.clearTimeout(expandTimer.current);
    const target = over ? useTaskStore.getState().tasks[over.id] : undefined;
    if (target && over && over.id !== active.id && target.collapsed && target.childIds.length > 0) {
      expandTimer.current = window.setTimeout(
        () => useTaskStore.getState().update(target.id, { collapsed: false }),
        EXPAND_DELAY,
      );
    }
  };

  const onDragEnd = ({ active, over, delta }: DragEndEvent) => {
    const id = String(active.id);
    const p = over
      ? getProjection(session.current.items, id, String(over.id), delta.x, session.current.indent)
      : null;
    finish();
    if (p) {
      const store = useTaskStore.getState();
      store.move(id, projectionTarget(store, id, p));
    }
  };

  // The drop indicator sits at the projected slot, indented to the projected depth. Row li's are
  // never transformed by the sort, so their live rects are the un-shifted layout.
  useLayoutEffect(() => {
    const line = indicatorRef.current;
    const list = listRef.current;
    if (!line || !list || !activeId || !overId || !projection) return;
    const rect = (id: string) =>
      list.querySelector<HTMLElement>(`[data-row-id="${id}"]`)?.getBoundingClientRect();
    const active = rect(activeId);
    const over = rect(overId);
    if (!active || !over) return;
    const from = dragItems.findIndex((i) => i.id === activeId);
    const to = dragItems.findIndex((i) => i.id === overId);
    const slotTop = to > from ? over.bottom - active.height : to < from ? over.top : active.top;
    const style = getComputedStyle(list);
    const left = parseFloat(style.paddingLeft) + projection.depth * session.current.indent;
    line.style.top = `${slotTop - list.getBoundingClientRect().top - list.clientTop}px`;
    line.style.left = `${left}px`;
    line.style.right = style.paddingRight;
    line.style.opacity = '1';
  }, [activeId, overId, projection, dragItems]);

  const subtasks = activeId ? items.length - dragItems.length : 0;

  return (
    <LayoutGroup>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        accessibility={{ announcements, screenReaderInstructions: instructions }}
        onDragStart={onDragStart}
        onDragMove={({ delta }) => setDeltaX(delta.x)}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={finish}
      >
        <SortableContext
          items={dragItems.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul ref={listRef} className={styles.list} role="tree" aria-label="Tasks">
            <AnimatePresence initial={false}>
              {items.map((item, i) => (
                <SortableTaskItem
                  key={item.id}
                  id={item.id}
                  depth={item.depth}
                  guides={guides[i]}
                  dragEnabled={dragEnabled}
                />
              ))}
            </AnimatePresence>
            {activeId && (
              <div
                ref={indicatorRef}
                className={styles.indicator}
                data-reduced={reduced || undefined}
                aria-hidden="true"
              />
            )}
          </ul>
        </SortableContext>
        <DragOverlay dropAnimation={reduced ? null : undefined}>
          {activeId ? <DragPreview id={activeId} subtasks={subtasks} /> : null}
        </DragOverlay>
      </DndContext>
      {ids.length === 0 && tag === null && (
        // Everything is done: once the last rows have popped away, say so.
        <div className={styles.allClear}>
          <EmptyState celebrate={celebrate} />
        </div>
      )}
      <UpcomingFooter />
      <div className={styles.srOnly} aria-live="polite">
        {liveText}
      </div>
    </LayoutGroup>
  );
}
