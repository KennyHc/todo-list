import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  deadlineBucket,
  dueLabel,
  isISODate,
  parseISO,
  startsLabel,
  weekdayName,
} from './dates';

// Tue 20 Oct 2026.
const TODAY = '2026-10-20';

describe('startsLabel', () => {
  it('says tomorrow, the weekday within the week, otherwise the date', () => {
    expect(startsLabel('2026-10-21', TODAY)).toBe('Starts tomorrow');
    expect(startsLabel('2026-10-26', TODAY)).toMatch(/^Starts Mon/);
    expect(startsLabel('2026-10-22', TODAY)).toBe(
      `Starts ${weekdayName('2026-10-22').slice(0, 3)}`,
    );
    expect(startsLabel('2026-10-27', TODAY)).toBe('Starts Oct 27');
    expect(startsLabel('2026-11-02', TODAY)).toBe('Starts Nov 2');
  });

  it('adds the year when it is another one', () => {
    expect(startsLabel('2027-01-04', TODAY)).toBe('Starts Jan 4, 2027');
  });
});

describe('isISODate', () => {
  it('accepts YYYY-MM-DD strings', () => {
    expect(isISODate('2026-10-20')).toBe(true);
    expect(isISODate('0001-01-01')).toBe(true);
  });

  it('rejects other shapes and non-strings', () => {
    for (const v of ['', '2026-1-2', '26-10-20', '2026/10/20', '2026-10-20T00:00', ' 2026-10-20']) {
      expect(isISODate(v)).toBe(false);
    }
    for (const v of [null, undefined, 20261020, new Date(), {}]) {
      expect(isISODate(v)).toBe(false);
    }
  });

  it('checks shape only, not calendar validity', () => {
    expect(isISODate('2026-13-45')).toBe(true);
  });
});

describe('parseISO', () => {
  it('returns local midnight of that calendar date', () => {
    const d = parseISO('2026-10-20');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 20]);
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0]);
  });

  it('handles a leap day', () => {
    const d = parseISO('2028-02-29');
    expect([d.getMonth(), d.getDate()]).toEqual([1, 29]);
  });
});

describe('addDays', () => {
  it('adds, subtracts and returns the same date for zero', () => {
    expect(addDays(TODAY, 1)).toBe('2026-10-21');
    expect(addDays(TODAY, 0)).toBe(TODAY);
    expect(addDays(TODAY, -1)).toBe('2026-10-19');
  });

  it('crosses month boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('crosses year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('handles leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('handles large offsets', () => {
    expect(addDays('2026-01-01', 365)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -365)).toBe('2025-01-01');
  });

  it('is not thrown off by daylight saving changes', () => {
    // US DST: 2026-03-08 (spring forward) and 2026-11-01 (fall back).
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-10-31', 2)).toBe('2026-11-02');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  });
});

describe('daysBetween', () => {
  it('is zero for the same date and signed otherwise', () => {
    expect(daysBetween(TODAY, TODAY)).toBe(0);
    expect(daysBetween(TODAY, '2026-10-27')).toBe(7);
    expect(daysBetween('2026-10-27', TODAY)).toBe(-7);
  });

  it('counts across month boundaries', () => {
    expect(daysBetween('2026-10-31', '2026-11-01')).toBe(1);
    expect(daysBetween('2026-02-01', '2026-03-01')).toBe(28);
    expect(daysBetween('2026-10-01', '2026-11-01')).toBe(31);
  });

  it('counts across year boundaries', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
    expect(daysBetween('2027-01-01', '2026-12-25')).toBe(-7);
  });

  it('counts leap days', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2027-02-28', '2027-03-01')).toBe(1);
    expect(daysBetween('2028-01-01', '2029-01-01')).toBe(366);
  });

  it('counts whole days over daylight saving changes', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
  });

  it('is the inverse of addDays', () => {
    for (const n of [-400, -31, -1, 0, 1, 30, 59, 366, 1000]) {
      expect(daysBetween(TODAY, addDays(TODAY, n))).toBe(n);
    }
  });
});

describe('dueLabel', () => {
  it('says Today and Tomorrow', () => {
    expect(dueLabel(TODAY, TODAY)).toBe('Today');
    expect(dueLabel('2026-10-21', TODAY)).toBe('Tomorrow');
  });

  it('uses the full weekday name from 2 to 6 days out', () => {
    expect(dueLabel('2026-10-22', TODAY)).toBe(weekdayName('2026-10-22'));
    expect(dueLabel('2026-10-22', TODAY)).toMatch(/^Thu/);
    expect(dueLabel('2026-10-26', TODAY)).toMatch(/^Mon/);
  });

  it('switches to a date from 7 days out', () => {
    expect(dueLabel('2026-10-27', TODAY)).toBe('Oct 27');
    expect(dueLabel('2026-12-01', TODAY)).toBe('Dec 1');
  });

  it('shows a date, not a relative word, for past days', () => {
    expect(dueLabel('2026-10-19', TODAY)).toBe('Oct 19');
    expect(dueLabel('2026-10-01', TODAY)).toBe('Oct 1');
  });

  it('adds the year when it is another one', () => {
    expect(dueLabel('2027-01-04', TODAY)).toBe('Jan 4, 2027');
    expect(dueLabel('2025-12-31', TODAY)).toBe('Dec 31, 2025');
  });

  it('uses relative words across a year boundary', () => {
    expect(dueLabel('2027-01-01', '2026-12-31')).toBe('Tomorrow');
    expect(dueLabel('2027-01-02', '2026-12-31')).toMatch(/^Sat/);
  });
});

describe('deadlineBucket', () => {
  const open = (dueDate: string | null) => ({ done: false, dueDate });

  it('puts done tasks in done, whatever the deadline', () => {
    expect(deadlineBucket({ done: true, dueDate: null }, TODAY)).toBe('done');
    expect(deadlineBucket({ done: true, dueDate: '2020-01-01' }, TODAY)).toBe('done');
  });

  it('puts tasks without a deadline in none', () => {
    expect(deadlineBucket(open(null), TODAY)).toBe('none');
  });

  it('buckets by days until the deadline', () => {
    expect(deadlineBucket(open('2026-10-19'), TODAY)).toBe('overdue');
    expect(deadlineBucket(open('2025-01-01'), TODAY)).toBe('overdue');
    expect(deadlineBucket(open(TODAY), TODAY)).toBe('today');
    expect(deadlineBucket(open('2026-10-21'), TODAY)).toBe('tomorrow');
    expect(deadlineBucket(open('2026-10-22'), TODAY)).toBe('week');
    expect(deadlineBucket(open('2026-10-27'), TODAY)).toBe('week');
    expect(deadlineBucket(open('2026-10-28'), TODAY)).toBe('later');
    expect(deadlineBucket(open('2027-10-20'), TODAY)).toBe('later');
  });

  it('buckets across a year boundary', () => {
    expect(deadlineBucket(open('2026-12-31'), '2027-01-01')).toBe('overdue');
    expect(deadlineBucket(open('2027-01-01'), '2026-12-31')).toBe('tomorrow');
    expect(deadlineBucket(open('2027-01-07'), '2026-12-31')).toBe('week');
    expect(deadlineBucket(open('2027-01-08'), '2026-12-31')).toBe('later');
  });
});
