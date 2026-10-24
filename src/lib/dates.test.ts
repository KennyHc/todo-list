import { describe, expect, it } from 'vitest';
import { startsLabel, weekdayName } from './dates';

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
