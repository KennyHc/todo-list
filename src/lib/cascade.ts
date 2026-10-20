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

/** Seconds the struck-through row rests before it shrinks and pops (the strike's duration). */
export const STRIKE_REST = 0.42;
/** A parent pops this long after its last completed child. */
export const PARENT_POP_LAG = 0.12;

/**
 * When (seconds after the shared removal time) each row of a completion wave starts its pop.
 * Rows without completed children in the wave pop at their cascade delay, so the children go
 * in order; a row with some pops `PARENT_POP_LAG` after its last child. `ids` are the rows
 * being removed together; `toggledId` is the task the user toggled (null: no stagger).
 */
export function popDelays(
  tree: TaskTree,
  toggledId: string | null,
  ids: readonly string[],
): Map<string, number> {
  const inWave = new Set(ids);
  const out = new Map<string, number>();
  const visit = (id: string): number => {
    const known = out.get(id);
    if (known !== undefined) return known;
    const kids = (tree.tasks[id]?.childIds ?? []).filter((child) => inWave.has(child));
    const at =
      kids.length === 0
        ? toggledId === null
          ? 0
          : toggleDelay(tree, toggledId, id)
        : Math.max(...kids.map(visit)) + PARENT_POP_LAG;
    out.set(id, at);
    return at;
  };
  for (const id of ids) visit(id);
  return out;
}

/** How long (ms) to keep a just-completed wave on screen: its latest strike plus a rest. */
export function strikeHoldMs(
  tree: TaskTree,
  toggledId: string | null,
  ids: readonly string[],
): number {
  const latest =
    toggledId === null ? 0 : Math.max(0, ...ids.map((id) => toggleDelay(tree, toggledId, id)));
  return Math.round((latest + STRIKE_REST) * 1000);
}
