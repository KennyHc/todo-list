import { describe, expect, it } from 'vitest';
import type { Task, TaskTree } from '../types';
import {
  nextMondayDate,
  overdueIds,
  overdueMoveLabel,
  pickDateLabel,
  quickPicks,
  rescheduleLabel,
  weekendDate,
} from './reschedule';

// October 2026: Tue 20, Wed 21, Thu 22, Fri 23, Sat 24, Sun 25, Mon 26.
const TUE = '2026-10-20';
const FRI = '2026-10-23';
const SAT = '2026-10-24';
const SUN = '2026-10-25';
const MON = '2026-10-26';

describe('weekendDate', () => {
  it('is the coming Saturday on a weekday', () => {
    expect(weekendDate(TUE)).toBe(SAT);
    expect(weekendDate(FRI)).toBe(SAT);
    expect(weekendDate(MON)).toBe('2026-10-31');
  });
  it('is next Saturday when it is already the weekend', () => {
    expect(weekendDate(SAT)).toBe('2026-10-31');
    expect(weekendDate(SUN)).toBe('2026-10-31');
  });
});

describe('nextMondayDate', () => {
  it('is the Monday after today, a week ahead on a Monday', () => {
    expect(nextMondayDate(TUE)).toBe(MON);
    expect(nextMondayDate(SAT)).toBe(MON);
    expect(nextMondayDate(SUN)).toBe(MON);
    expect(nextMondayDate(MON)).toBe('2026-11-02');
  });
  it('crosses month and year ends', () => {
    expect(nextMondayDate('2026-12-30')).toBe('2027-01-04');
  });
});

describe('quickPicks', () => {
  it('resolves the four picks with their hotkeys', () => {
    expect(quickPicks(TUE)).toEqual([
      { key: 'today', label: 'Today', date: TUE, hotkey: 't' },
      { key: 'tomorrow', label: 'Tomorrow', date: '2026-10-21', hotkey: 'm' },
      { key: 'weekend', label: 'This weekend', date: SAT, hotkey: 'w' },
      { key: 'nextWeek', label: 'Next week', date: MON, hotkey: 'n' },
    ]);
  });
  it('on Friday the weekend is tomorrow', () => {
    const picks = quickPicks(FRI);
    expect(picks[2].date).toBe(SAT);
    expect(picks[1].date).toBe(SAT);
  });
  it('on Saturday and Sunday the weekend means the next one', () => {
    for (const day of [SAT, SUN]) {
      const weekend = quickPicks(day)[2];
      expect(weekend.label).toBe('Next weekend');
      expect(weekend.date).toBe('2026-10-31');
    }
  });
});

describe('labels', () => {
  it('shows the weekday and date', () => {
    expect(pickDateLabel(SAT)).toMatch(/Sat/);
    expect(pickDateLabel(SAT)).toMatch(/Oct\s*24|24\s*Oct/);
  });
  it('words the undo entry', () => {
    expect(rescheduleLabel('Pay rent', SAT)).toBe(`Moved “Pay rent” to ${pickDateLabel(SAT)}`);
    expect(rescheduleLabel('Pay rent', null)).toBe('Removed date from “Pay rent”');
    expect(overdueMoveLabel(3)).toBe('Moved 3 overdue tasks to today');
    expect(overdueMoveLabel(1)).toBe('Moved 1 overdue task to today');
  });
});

const task = (id: string, patch: Partial<Task>): Task => ({
  id,
  title: id,
  parentId: null,
  childIds: [],
  difficulty: 1,
  color: null,
  collapsed: false,
  done: false,
  createdAt: 0,
  tags: [],
  dueDate: null,
  repeat: null,
  plannedFor: null,
  ...patch,
});

describe('overdueIds', () => {
  const tree: TaskTree = {
    rootIds: ['late', 'today', 'future', 'none', 'doneLate', 'lateTag'],
    tasks: {
      late: task('late', { dueDate: '2026-10-19' }),
      today: task('today', { dueDate: TUE }),
      future: task('future', { dueDate: '2026-10-21' }),
      none: task('none', {}),
      doneLate: task('doneLate', { dueDate: '2026-10-01', done: true }),
      lateTag: task('lateTag', { dueDate: '2026-09-01', tags: ['home'] }),
    },
  };
  it('lists open tasks due before today', () => {
    expect(overdueIds(tree, TUE).sort()).toEqual(['late', 'lateTag']);
  });
  it('can be limited to a tag', () => {
    expect(overdueIds(tree, TUE, 'home')).toEqual(['lateTag']);
  });
});
