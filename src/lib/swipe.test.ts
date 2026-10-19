import { describe, expect, it } from 'vitest';
import { rubberBand, swipeAction, swipeIntent, swipeThreshold } from './swipe';

describe('swipeThreshold', () => {
  it('is 35% of the width, at least 96px', () => {
    expect(swipeThreshold(200)).toBe(96);
    expect(swipeThreshold(0)).toBe(96);
    expect(swipeThreshold(400)).toBeCloseTo(140);
  });
});

describe('rubberBand', () => {
  it('follows 1:1 up to the threshold, both ways', () => {
    expect(rubberBand(50, 100, 300)).toBe(50);
    expect(rubberBand(-100, 100, 300)).toBe(-100);
    expect(rubberBand(0, 100, 300)).toBe(0);
  });
  it('dampens past the threshold', () => {
    expect(rubberBand(200, 100, 300)).toBeCloseTo(135);
    expect(rubberBand(-200, 100, 300)).toBeCloseTo(-135);
  });
  it('caps at max', () => {
    expect(rubberBand(5000, 100, 150)).toBe(150);
    expect(rubberBand(-5000, 100, 150)).toBe(-150);
  });
});

describe('swipeIntent', () => {
  it('waits for 10px of travel', () => {
    expect(swipeIntent(5, 3)).toBeNull();
    expect(swipeIntent(-9, 9)).toBeNull();
  });
  it('picks the dominant axis', () => {
    expect(swipeIntent(12, 3)).toBe('x');
    expect(swipeIntent(-14, 2)).toBe('x');
    expect(swipeIntent(3, 12)).toBe('y');
    expect(swipeIntent(11, 11)).toBe('y');
  });
});

describe('swipeAction', () => {
  it('maps release distance to an action', () => {
    expect(swipeAction(96, 96)).toBe('complete');
    expect(swipeAction(-96, 96)).toBe('delete');
    expect(swipeAction(95, 96)).toBeNull();
    expect(swipeAction(-40, 96)).toBeNull();
  });
});
