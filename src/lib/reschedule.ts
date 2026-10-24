import type { TaskTree } from '../types';
import { addDays, parseISO, weekdayDate } from './dates';
import { hiddenUntilStart } from './tree';
import { dueStatus } from './views';

export type PickKey = 'today' | 'tomorrow' | 'weekend' | 'nextWeek';

export type QuickPick = {
  key: PickKey;
  label: string;
  /** The date this pick resolves to, 'YYYY-MM-DD'. */
  date: string;
  /** The letter that picks it inside the Reschedule menu. */
  hotkey: string;
};

/** The coming Saturday; on a Saturday or Sunday, the one after (Today already covers now). */
export function weekendDate(today: string): string {
  const dow = parseISO(today).getDay();
  if (dow === 6) return addDays(today, 7);
  if (dow === 0) return addDays(today, 6);
  return addDays(today, 6 - dow);
}

/** The next Monday after `today` (a week ahead when today is a Monday). */
export function nextMondayDate(today: string): string {
  return addDays(today, 7 - ((parseISO(today).getDay() + 6) % 7));
}

/** Today, Tomorrow, the weekend and next week, each resolved against `today`. */
export function quickPicks(today: string): QuickPick[] {
  const dow = parseISO(today).getDay();
  return [
    { key: 'today', label: 'Today', date: today, hotkey: 't' },
    { key: 'tomorrow', label: 'Tomorrow', date: addDays(today, 1), hotkey: 'm' },
    {
      key: 'weekend',
      label: dow === 6 || dow === 0 ? 'Next weekend' : 'This weekend',
      date: weekendDate(today),
      hotkey: 'w',
    },
    { key: 'nextWeek', label: 'Next week', date: nextMondayDate(today), hotkey: 'n' },
  ];
}

/** "Sat, Oct 24": how a resolved date is shown beside its quick pick. */
export const pickDateLabel = (date: string): string => weekdayDate(date);

/** The undo toast text for moving a task (or clearing its date with null). */
export const rescheduleLabel = (title: string, date: string | null): string =>
  date === null ? `Removed date from “${title}”` : `Moved “${title}” to ${pickDateLabel(date)}`;

/** The undo toast text for hiding a task until a date (or, with null, showing it now). */
export const hideUntilLabel = (title: string, date: string | null): string =>
  date === null ? `Showing “${title}” now` : `Hid “${title}” until ${pickDateLabel(date)}`;

/**
 * Ids of the open tasks whose due date has passed. With a tag, only tasks carrying that tag
 * (what a tag-filtered list shows as matches). Tasks that have not started yet are hidden, so
 * they are not counted.
 */
export function overdueIds(tree: TaskTree, today: string, tag: string | null = null): string[] {
  return Object.values(tree.tasks)
    .filter(
      (task) =>
        !task.done &&
        dueStatus(task.dueDate, today) === 'overdue' &&
        (tag === null || task.tags.includes(tag)) &&
        !hiddenUntilStart(tree, task.id, today),
    )
    .map((task) => task.id);
}

/** "Moved 3 overdue tasks to today". */
export const overdueMoveLabel = (count: number): string =>
  `Moved ${count} overdue ${count === 1 ? 'task' : 'tasks'} to today`;
