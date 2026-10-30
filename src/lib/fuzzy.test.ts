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
    const substring = score('milk', 'Buy milk');
    const wordStart = score('bumi', 'Buy milk');
    const subsequence = score('bymk', 'Buy milk');
    expect(substring).toBeGreaterThan(wordStart);
    expect(wordStart).toBeGreaterThan(subsequence);
    expect(subsequence).toBeGreaterThan(0);
  });

  it('matches initials across words', () => {
    expect(fuzzyMatch('bm', 'Buy milk')?.indices).toEqual([0, 4]);
    expect(fuzzyMatch('bumi', 'Buy milk')?.indices).toEqual([0, 1, 4, 5]);
  });

  it('falls back to a subsequence for queries of 4+ characters', () => {
    expect(fuzzyMatch('bymk', 'Buy milk')?.indices).toEqual([0, 2, 4, 7]);
    expect(fuzzyMatch('b y m k', 'Buy milk')?.indices).toEqual([0, 2, 4, 7]);
  });

  it('only counts contiguous or word-start matches for queries under 4 characters', () => {
    const title = 'Write blog post on PWA offline sync';
    expect(fuzzyMatch('lis', title)).toBeNull();
    expect(fuzzyMatch('bk', 'Buy milk')).toBeNull();
    expect(fuzzyMatch('b k', 'Buy milk')).toBeNull();
    expect(fuzzyMatch('lin', title)?.indices).toEqual([26, 27, 28]);
    expect(fuzzyMatch('bps', title)?.indices).toEqual([6, 11, 31]);
  });

  it('ranks contiguous matches above scattered ones for longer queries', () => {
    expect(score('sync', 'Write blog post on PWA offline sync')).toBeGreaterThan(
      score('sync', 'Set your notes catalog'),
    );
    expect(score('list', 'Shopping list')).toBeGreaterThan(score('list', 'Plan inside a sprint'));
    expect(score('offl', 'Plan offline mode')).toBeGreaterThan(
      score('offl', 'Order coffee filters'),
    );
  });

  it('prefers a word-start substring and earlier or shorter matches', () => {
    expect(score('mil', 'milk run')).toBeGreaterThan(score('mil', 'family'));
    expect(fuzzyMatch('mil', 'family mile')?.indices).toEqual([7, 8, 9]);
    expect(score('milk', 'Milk')).toBeGreaterThan(score('milk', 'Milk the cows at dawn'));
  });

  it('prefers tighter subsequences', () => {
    expect(score('abcd', 'axbxcxd')).toBeLessThan(score('abcd', 'abxxcd'));
  });
});
