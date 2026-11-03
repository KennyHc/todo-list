import type { Task } from '../types';
import { todayISO } from './views';

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Calendar date `n` days after `iso` (local time, DST-safe). */
export function addDays(iso: string, n: number): string {
  const date = parseISO(iso);
  date.setDate(date.getDate() + n);
  return todayISO(date);
}

/** Whole calendar days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const num = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
  };
  return num(to) - num(from);
}

const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const longDate = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const dayHeaderFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "Today", "Tomorrow", a weekday within 6 days, otherwise "Oct 24". */
export function dueLabel(dueDate: string, today: string = todayISO()): string {
  const days = daysBetween(today, dueDate);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  const date = parseISO(dueDate);
  if (days >= 2 && days <= 6) return weekdayFormat.format(date);
  const sameYear = date.getFullYear() === parseISO(today).getFullYear();
  return (sameYear ? shortDate : longDate).format(date);
}

/** "Today", "Yesterday", otherwise "Mon, Oct 12". */
export function dayHeader(timestamp: number, now: Date = new Date()): string {
  const day = todayISO(new Date(timestamp));
  const days = daysBetween(todayISO(now), day);
  if (days === 0) return 'Today';
  if (days === -1) return 'Yesterday';
  return dayHeaderFormat.format(new Date(timestamp));
}

export const formatTime = (timestamp: number): string => timeFormat.format(new Date(timestamp));

export type DeadlineBucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none' | 'done';

export const BUCKET_LABELS: Record<DeadlineBucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'This week',
  later: 'Later',
  none: 'No deadline',
  done: 'Completed',
};

export function deadlineBucket(
  task: Pick<Task, 'done' | 'dueDate'>,
  today: string = todayISO(),
): DeadlineBucket {
  if (task.done) return 'done';
  if (task.dueDate === null) return 'none';
  const days = daysBetween(today, task.dueDate);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return days <= 7 ? 'week' : 'later';
}
