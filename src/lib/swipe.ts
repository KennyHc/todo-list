/** Pure maths for the row swipe gesture. */

export const MIN_THRESHOLD = 96;
export const THRESHOLD_RATIO = 0.35;
/** Past the threshold the row follows the finger at this fraction. */
export const RESISTANCE = 0.35;
/** Horizontal (or vertical) travel before the gesture picks a direction. */
export const INTENT_PX = 10;
export const MAX_TRAVEL_RATIO = 0.7;

/** Distance that arms the action: 35% of the row width, at least 96px. */
export function swipeThreshold(width: number): number {
  return Math.max(MIN_THRESHOLD, width * THRESHOLD_RATIO);
}

/** Maps finger travel to row travel: 1:1 up to the threshold, dampened beyond, capped at `max`. */
export function rubberBand(dx: number, threshold: number, max: number): number {
  const sign = dx < 0 ? -1 : 1;
  const a = Math.abs(dx);
  const out = a <= threshold ? a : threshold + (a - threshold) * RESISTANCE;
  return sign * Math.min(out, max);
}

/** Which axis a pan belongs to, or null while it is still too small to tell. */
export function swipeIntent(dx: number, dy: number): 'x' | 'y' | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < INTENT_PX) return null;
  return ax > ay ? 'x' : 'y';
}

export type SwipeAction = 'complete' | 'delete' | null;

/** What a release at `dx` does. */
export function swipeAction(dx: number, threshold: number): SwipeAction {
  if (dx >= threshold) return 'complete';
  if (dx <= -threshold) return 'delete';
  return null;
}
