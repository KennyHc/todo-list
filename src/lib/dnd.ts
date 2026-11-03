import { arrayMove } from '@dnd-kit/sortable';
import type { TaskTree } from '../types';
import type { MoveTarget } from './tree';
import { treeRows } from './views';

/** Indent step of one nesting level in px. Mirrors `--indent` in TaskItem.module.css (desktop). */
export const INDENT = 24;

/** A row of the flattened tree: what is needed to project a drop. */
export type FlatItem = { id: string; depth: number; parentId: string | null };

/**
 * Visible rows in render order: open tasks only, collapsed subtrees, filtered rows and (unless
 * `showUpcoming`) tasks that have not started yet skipped.
 */
export function flattenTree(
  tree: TaskTree,
  { tag, today, showUpcoming }: { tag: string | null; today?: string; showUpcoming?: boolean },
): string[] {
  return treeRows(tree, tag, { today, showUpcoming });
}

/** Depth and parent for each id, keeping the given order. Unknown ids are dropped. */
export function itemsFor(tree: Pick<TaskTree, 'tasks'>, ids: string[]): FlatItem[] {
  const items: FlatItem[] = [];
  for (const id of ids) {
    const task = tree.tasks[id];
    if (!task) continue;
    let depth = 0;
    for (let p = task.parentId; p !== null && tree.tasks[p]; p = tree.tasks[p].parentId) depth += 1;
    items.push({ id, depth, parentId: task.parentId });
  }
  return items;
}

/** Drops the rows that belong to `activeId`'s subtree (they move with it). */
export function withoutDescendants(items: FlatItem[], activeId: string): FlatItem[] {
  const at = items.findIndex((item) => item.id === activeId);
  if (at === -1) return items;
  let end = at + 1;
  while (end < items.length && items[end].depth > items[at].depth) end += 1;
  return end === at + 1 ? items : [...items.slice(0, at + 1), ...items.slice(end)];
}

/**
 * Per-level guide flags for each row: one char per ancestor level, 'f' when the row opens that
 * ancestor's visible subtree, 'l' when it closes it, 'b' for both and 'n' for neither.
 */
export function guideFlags(items: FlatItem[]): string[] {
  return items.map((item, i) => {
    let flags = '';
    for (let level = 0; level < item.depth; level += 1) {
      const first = items[i - 1]?.depth === level;
      const last = (items[i + 1]?.depth ?? 0) <= level;
      flags += first ? (last ? 'b' : 'f') : last ? 'l' : 'n';
    }
    return flags;
  });
}

export type Projection = {
  depth: number;
  minDepth: number;
  maxDepth: number;
  parentId: string | null;
  /** The sibling the task would follow in the new parent, or null for the first slot. */
  afterId: string | null;
  /** Position among the projected siblings as shown (the active task excluded). */
  index: number;
  /** Row the dragged task would sit right after (null at the very top). */
  previousId: string | null;
};

/**
 * Where a dragged row lands if dropped over `overId` after moving `deltaX` px sideways.
 * `items` is the flattened list without the active row's descendants. Depth is clamped between
 * what the next row needs as a parent and one level below the previous row.
 */
export function getProjection(
  items: FlatItem[],
  activeId: string,
  overId: string,
  deltaX: number,
  indent: number = INDENT,
): Projection | null {
  const overIndex = items.findIndex((item) => item.id === overId);
  const activeIndex = items.findIndex((item) => item.id === activeId);
  if (overIndex === -1 || activeIndex === -1) return null;

  const moved = arrayMove(items, activeIndex, overIndex);
  const previous = moved[overIndex - 1];
  const next = moved[overIndex + 1];
  const maxDepth = previous ? previous.depth + 1 : 0;
  const minDepth = Math.min(next ? next.depth : 0, maxDepth);
  const wanted = items[activeIndex].depth + Math.round(deltaX / indent);
  const depth = Math.min(maxDepth, Math.max(minDepth, wanted));

  let parentId: string | null = null;
  if (depth > 0 && previous) {
    if (depth > previous.depth) parentId = previous.id;
    else if (depth === previous.depth) parentId = previous.parentId;
    else {
      parentId =
        moved
          .slice(0, overIndex)
          .reverse()
          .find((item) => item.depth === depth)?.parentId ?? null;
    }
  }

  let index = 0;
  let afterId: string | null = null;
  for (const item of moved.slice(0, overIndex)) {
    if (item.parentId === parentId) {
      index += 1;
      afterId = item.id;
    }
  }
  return {
    depth,
    minDepth,
    maxDepth,
    parentId,
    afterId,
    index,
    previousId: previous?.id ?? null,
  };
}

/** Converts a projection to a store move: the index is into the parent's real child list. */
export function projectionTarget(
  tree: TaskTree,
  activeId: string,
  projection: Pick<Projection, 'parentId' | 'afterId'>,
): MoveTarget {
  const { parentId, afterId } = projection;
  const siblings = (
    parentId === null ? tree.rootIds : (tree.tasks[parentId]?.childIds ?? [])
  ).filter((id) => id !== activeId);
  const at = afterId === null ? -1 : siblings.indexOf(afterId);
  return { parentId, index: at + 1 };
}

/**
 * Where Alt+Up / Alt+Down puts a task: past its neighbouring open sibling as shown (done
 * siblings are hidden in History). Null when there is none.
 */
export function siblingMoveTarget(
  tree: TaskTree,
  id: string,
  step: 1 | -1,
  visible: Set<string> | null = null,
): MoveTarget | null {
  const task = tree.tasks[id];
  if (!task) return null;
  const raw = task.parentId === null ? tree.rootIds : tree.tasks[task.parentId].childIds;
  const shown = raw.filter(
    (sibling) => !tree.tasks[sibling].done && (!visible || visible.has(sibling)),
  );
  const neighbor = shown[shown.indexOf(id) + step];
  if (neighbor === undefined) return null;
  const at = raw.filter((sibling) => sibling !== id).indexOf(neighbor);
  return { parentId: task.parentId, index: step < 0 ? at : at + 1 };
}
