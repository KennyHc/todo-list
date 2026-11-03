import { DIFFICULTY_NAMES, LEVELS, difficultyAria, difficultyLabel } from './difficulty';

describe('LEVELS', () => {
  it('lists the five levels in ascending order', () => {
    expect(LEVELS).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('DIFFICULTY_NAMES', () => {
  it('has a non-empty name for every level and nothing else', () => {
    expect(Object.keys(DIFFICULTY_NAMES).map(Number)).toEqual(LEVELS);
    for (const level of LEVELS) {
      expect(DIFFICULTY_NAMES[level].length).toBeGreaterThan(0);
    }
  });

  it('names the levels Trivial to Huge', () => {
    expect(LEVELS.map((l) => DIFFICULTY_NAMES[l])).toEqual([
      'Trivial',
      'Easy',
      'Medium',
      'Hard',
      'Huge',
    ]);
  });
});

describe('difficultyLabel', () => {
  it('returns the plain name for levels 1 to 4', () => {
    for (const level of [1, 2, 3, 4] as const) {
      expect(difficultyLabel(level)).toBe(DIFFICULTY_NAMES[level]);
    }
  });

  it('adds the "consider splitting" nudge at level 5 only', () => {
    expect(difficultyLabel(5)).toBe('Huge — consider splitting');
    for (const level of [1, 2, 3, 4] as const) {
      expect(difficultyLabel(level)).not.toContain('splitting');
    }
  });
});

describe('difficultyAria', () => {
  it('reads "Difficulty N of 5, Name" for every level', () => {
    expect(LEVELS.map(difficultyAria)).toEqual([
      'Difficulty 1 of 5, Trivial',
      'Difficulty 2 of 5, Easy',
      'Difficulty 3 of 5, Medium',
      'Difficulty 4 of 5, Hard',
      'Difficulty 5 of 5, Huge',
    ]);
  });

  it('does not include the splitting nudge', () => {
    expect(difficultyAria(5)).not.toContain('splitting');
  });
});
