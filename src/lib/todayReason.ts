import type { Task } from '../types';
import { daysBetween, parseISO } from './dates';
import { todayKind } from './today';

export type TodayReason = { label: string; danger: boolean };

const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const longDate = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** "Oct 12", with the year when it isn't this one. */
function dateName(iso: string, today: string): string {
  const date = parseISO(iso);
  return (date.getFullYear() === parseISO(today).getFullYear() ? shortDate : longDate).format(date);
}

/** "Mon" within the last week, else the date. */
function dayName(iso: string, today: string): string {
  const days = daysBetween(iso, today);
  return days >= 1 && days <= 6 ? weekday.format(parseISO(iso)) : dateName(iso, today);
}

/**
 * What a Today row says about itself, only when that adds information: "Overdue · Oct 18" (the
 * date is in the label, so the row needs no due pill) and "From Mon" (planned for an earlier
 * day). Due-today and planned-today rows say nothing.
 */
export function todayReason(task: Task, today: string): TodayReason | null {
  const kind = todayKind(task, today);
  if (kind === 'overdue' && task.dueDate !== null) {
    return { label: `Overdue \u00b7 ${dateName(task.dueDate, today)}`, danger: true };
  }
  if (kind === 'planned' && task.plannedFor !== null && task.plannedFor < today) {
    return { label: `From ${dayName(task.plannedFor, today)}`, danger: false };
  }
  return null;
}
