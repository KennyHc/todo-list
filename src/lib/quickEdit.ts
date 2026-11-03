import type { Task } from '../types';
import type { QuickAdd } from './quickAdd';
import { repeatPatch } from './recur';
import { normalizeTags } from './tags';
import type { TaskPatch } from './tree';
import { todayISO } from './views';

/**
 * The change a quick-add line makes to an existing task (a renamed title, or a new subtask's
 * first title). Only what the text sets changes: typed tags are added to the task's tags, a
 * typed date, start date or difficulty replaces the task's, and a typed repeat goes through
 * `repeatPatch` (it gives the task a due date only if it has none and none was typed). A line
 * that parses to an empty title (only tags) keeps the current title.
 */
export function quickPatch(
  task: Pick<Task, 'title' | 'tags' | 'dueDate'>,
  parsed: QuickAdd,
  today: string = todayISO(),
): TaskPatch {
  const patch: TaskPatch = { title: parsed.title || task.title };
  if (parsed.tags.length > 0) patch.tags = normalizeTags([...task.tags, ...parsed.tags]);
  if (parsed.difficulty !== null) patch.difficulty = parsed.difficulty;
  if (parsed.startDate !== null) patch.startDate = parsed.startDate;
  const typedDate = parsed.tokens.some((t) => t.kind === 'date') ? parsed.dueDate : null;
  if (typedDate !== null) patch.dueDate = typedDate;
  if (parsed.repeat !== null) {
    Object.assign(patch, repeatPatch({ dueDate: typedDate ?? task.dueDate }, parsed.repeat, today));
  }
  return patch;
}
