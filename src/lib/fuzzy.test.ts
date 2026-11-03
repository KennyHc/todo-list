import { describe, expect, it } from 'vitest';
import { fuzzyMatch } from './fuzzy';

const score = (q: string, t: string) => fuzzyMatch(q, t)?.score ?? -Infinity;

describe('fuzzyMatch', () => {
  it('matches everything on an empty query', () => {
    expect(fuzzyMatch('  ', 'anything')).toEqual({ score: 0, indices: [] });
  });

  it('returns null when characters are missing or out of order', () => {
    expect(fuzzyMatch('xyz', 'Buy milk')).toBeNull();
    expect(fuzzyMatch('kb', 'Buy milk')).toBeNull();
  });

  it('is case-insensitive and reports contiguous indices for a substring', () => {
    expect(fuzzyMatch('MIL', 'Buy milk')).toMatchObject({ indices: [4, 5, 6] });
  });

  it('ranks substring above word-start above subsequence', () => {
    const substring = score('mi', 'Buy milk');
    const wordStart = score('bm', 'Buy milk');
    const subsequence = score('bk', 'Buy milk');
    expect(substring).toBeGreaterThan(wordStart);
    expect(wordStart).toBeGreaterThan(subsequence);
    expect(subsequence).toBeGreaterThan(0);
  });

  it('matches initials across words', () => {
    expect(fuzzyMatch('bm', 'Buy milk')?.indices).toEqual([0, 4]);
    expect(fuzzyMatch('bumi', 'Buy milk')?.indices).toEqual([0, 1, 4, 5]);
  });

  it('falls back to a subsequence', () => {
    expect(fuzzyMatch('bk', 'Buy milk')?.indices).toEqual([0, 7]);
  });

  it('prefers a word-start substring and earlier or shorter matches', () => {
    expect(score('mil', 'milk run')).toBeGreaterThan(score('mil', 'family'));
    expect(fuzzyMatch('mil', 'family mile')?.indices).toEqual([7, 8, 9]);
    expect(score('milk', 'Milk')).toBeGreaterThan(score('milk', 'Milk the cows at dawn'));
  });

  it('prefers tighter subsequences', () => {
    expect(score('abc', 'axbxc')).toBeLessThan(score('abc', 'abxxc'));
  });
});
