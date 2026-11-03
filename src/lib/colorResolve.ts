import type { Task, TaskTree } from '../types';

export type ColorSource = 'task' | 'tag' | 'parent' | null;

export type EffectiveColor = {
  color: string | null;
  source: ColorSource;
  /** The tag the colour came from, when `source` is 'tag' (or 'parent' via a parent's tag). */
  tag?: string;
};

const NONE: EffectiveColor = { color: null, source: null };

/**
 * The colour a row shows: its own override, else its first tag (in the task's tag order) that
 * has a colour, else its parent's effective colour, else none. `source` is 'parent' whenever
 * the colour was inherited, whatever the ancestor's own source was.
 */
export function effectiveColor(
  tree: TaskTree,
  tagColors: Readonly<Record<string, string>>,
  id: string,
): EffectiveColor {
  const seen = new Set<string>();
  let currentId: string | null = id;
  let inherited = false;
  while (currentId !== null && !seen.has(currentId)) {
    seen.add(currentId);
    const task: Task | undefined = tree.tasks[currentId];
    if (!task) break;
    if (task.color) {
      return inherited
        ? { color: task.color, source: 'parent' }
        : { color: task.color, source: 'task' };
    }
    const tag = task.tags.find((t) => tagColors[t]);
    if (tag !== undefined) {
      return inherited
        ? { color: tagColors[tag], source: 'parent', tag }
        : { color: tagColors[tag], source: 'tag', tag };
    }
    inherited = true;
    currentId = task.parentId;
  }
  return NONE;
}
