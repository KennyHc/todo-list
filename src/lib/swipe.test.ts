import { describe, expect, it } from 'vitest';
import {
  REVEAL_MIN,
  REVEAL_WIDTH,
  fullSwipeThreshold,
  rubberBand,
  stagedArmed,
  stagedRelease,
  stagedTravel,
  swipeAction,
  swipeIntent,
  swipeThreshold,
} from './swipe';

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

describe('fullSwipeThreshold', () => {
  it('is 70% of the width', () => {
    expect(fullSwipeThreshold(400)).toBeCloseTo(280);
    expect(fullSwipeThreshold(375)).toBeCloseTo(262.5);
  });
  it('always overshoots the open buttons, even on a tiny or unmeasured row', () => {
    expect(fullSwipeThreshold(0)).toBeGreaterThan(REVEAL_WIDTH);
    expect(fullSwipeThreshold(150)).toBeGreaterThan(REVEAL_WIDTH);
  });
});

describe('stagedTravel', () => {
  it('follows the finger 1:1 to the left, up to 90% of the width', () => {
    expect(stagedTravel(-80, 400)).toBe(-80);
    expect(stagedTravel(-300, 400)).toBe(-300);
    expect(stagedTravel(-5000, 400)).toBe(-360);
  });
  it('rubber-bands to the right', () => {
    expect(stagedTravel(50, 400)).toBe(50);
    expect(stagedTravel(5000, 400)).toBe(280);
  });
});

describe('stagedRelease', () => {
  const w = 400;
  it('does nothing (closes) for a short pull', () => {
    expect(stagedRelease(0, w, false)).toBe('close');
    expect(stagedRelease(-(REVEAL_MIN - 1), w, false)).toBe('close');
    expect(stagedRelease(40, w, false)).toBe('close');
  });
  it('reveals the buttons from the first threshold up to a full swipe', () => {
    expect(stagedRelease(-REVEAL_MIN, w, false)).toBe('reveal');
    expect(stagedRelease(-150, w, false)).toBe('reveal');
    expect(stagedRelease(-279, w, false)).toBe('reveal');
  });
  it('deletes past 70% of the width', () => {
    expect(stagedRelease(-280, w, false)).toBe('delete');
    expect(stagedRelease(-360, w, false)).toBe('delete');
  });
  it('completes a long right swipe from closed', () => {
    expect(stagedRelease(swipeThreshold(w), w, false)).toBe('complete');
  });
  it('an open row stays open when nudged, closes when pulled back, deletes on a full swipe', () => {
    expect(stagedRelease(-REVEAL_WIDTH - 20, w, true)).toBe('reveal');
    expect(stagedRelease(-REVEAL_WIDTH + 40, w, true)).toBe('reveal');
    expect(stagedRelease(-REVEAL_WIDTH + 100, w, true)).toBe('close');
    expect(stagedRelease(-300, w, true)).toBe('delete');
  });
  it('never completes from an open row', () => {
    expect(stagedRelease(swipeThreshold(w) + 20, w, true)).toBe('close');
  });
});

describe('stagedArmed', () => {
  it('arms the ends only', () => {
    expect(stagedArmed(-120, 400, false)).toBeNull();
    expect(stagedArmed(-290, 400, false)).toBe('left');
    expect(stagedArmed(150, 400, false)).toBe('right');
    expect(stagedArmed(150, 400, true)).toBeNull();
  });
});
