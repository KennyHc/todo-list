import type { TaskTree } from '../types';
import { getAncestors, getDescendants } from './tree';

/** Seconds between each descendant's start when a parent is toggled. */
export const DESCENDANT_STEP = 0.04;
export const DESCENDANT_MAX = 0.4;
/** Seconds per level when a toggle bubbles up to ancestors. */
export const ANCESTOR_STEP = 0.18;
export const ANCESTOR_MAX = 0.6;

/**
 * How long (seconds) task `id` should wait before animating its done-state change after
 * `toggledId` was toggled. The toggled task goes first, descendants stagger in pre-order,
 * ancestors follow once the wave has had time to reach them.
 */
export function toggleDelay(tree: TaskTree, toggledId: string, id: string): number {
  if (id === toggledId) return 0;

  // Walk up from `id`: if we meet the toggled task, `id` is one of its descendants.
  let parentId = tree.tasks[id]?.parentId ?? null;
  while (parentId !== null) {
    if (parentId === toggledId) {
      const index = getDescendants(tree, toggledId).indexOf(id);
      return Math.min(DESCENDANT_STEP * (index + 1), DESCENDANT_MAX);
    }
    parentId = tree.tasks[parentId]?.parentId ?? null;
  }

  const distance = getAncestors(tree, toggledId).indexOf(id) + 1;
  if (distance > 0) return Math.min(ANCESTOR_STEP * distance, ANCESTOR_MAX);
  return 0;
}
