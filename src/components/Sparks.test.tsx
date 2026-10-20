import { describe, expect, it } from 'vitest';
import { sparkVectors } from './Sparks';

describe('sparkVectors', () => {
  it('is deterministic per seed and differs between seeds', () => {
    expect(sparkVectors('task-1')).toEqual(sparkVectors('task-1'));
    expect(sparkVectors('task-1')).not.toEqual(sparkVectors('task-2'));
  });

  it('makes six sparks 14-22px out, spread around the circle', () => {
    for (const seed of ['a', 'b', 'c', 'dd', 'long-task-id-1234']) {
      const sparks = sparkVectors(seed);
      expect(sparks).toHaveLength(6);
      for (const { dx, dy } of sparks) {
        const distance = Math.hypot(dx, dy);
        expect(distance).toBeGreaterThanOrEqual(14 - 1e-9);
        expect(distance).toBeLessThanOrEqual(22 + 1e-9);
      }
      // Spread: every quadrant has at least one spark.
      const quadrants = new Set(sparks.map(({ dx, dy }) => `${dx >= 0}${dy >= 0}`));
      expect(quadrants.size).toBe(4);
    }
  });
});
