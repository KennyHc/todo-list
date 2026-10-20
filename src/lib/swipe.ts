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

// --- Two-stage swipe left (Later + Delete), like iOS Mail ------------------------------------

/** Each revealed action button is this wide. */
export const ACTION_WIDTH = 76;
/** A resting open row shows both buttons (Later, Delete). */
export const REVEAL_WIDTH = ACTION_WIDTH * 2;
/** A left swipe released past this much travel (and short of a full swipe) opens the buttons. */
export const REVEAL_MIN = 56;
/** A left swipe past this fraction of the row width deletes directly, as before. */
export const FULL_SWIPE_RATIO = 0.7;
/** However narrow the row, a full swipe must clearly overshoot the open buttons. */
const FULL_SWIPE_MARGIN = 48;
/** The row never travels further than this fraction of its width. */
const MAX_LEFT_RATIO = 0.9;

/** Travel that deletes without the buttons: 70% of the width, always beyond the open state. */
export function fullSwipeThreshold(width: number): number {
  return Math.max(width * FULL_SWIPE_RATIO, REVEAL_WIDTH + FULL_SWIPE_MARGIN);
}

/**
 * Row position for `total` travel (negative = left, and an open row starts at -REVEAL_WIDTH).
 * Left follows the finger 1:1 so the buttons slide out under it; right keeps the usual rubber
 * band toward the complete threshold.
 */
export function stagedTravel(total: number, width: number): number {
  if (total >= 0) return rubberBand(total, swipeThreshold(width), width * MAX_TRAVEL_RATIO);
  return Math.max(total, -width * MAX_LEFT_RATIO);
}

export type StagedRelease = 'complete' | 'delete' | 'reveal' | 'close';

/**
 * What a release does when left is two-stage. `total` is the row's travel from closed (an open
 * row starts at -REVEAL_WIDTH). Past a full swipe deletes, past the first threshold opens (or
 * keeps open) the buttons, a long right swipe from closed completes, anything else closes.
 */
export function stagedRelease(total: number, width: number, wasOpen: boolean): StagedRelease {
  if (total <= -fullSwipeThreshold(width)) return 'delete';
  if (total <= -REVEAL_MIN) return 'reveal';
  if (!wasOpen && total >= swipeThreshold(width)) return 'complete';
  return 'close';
}

/** Which end of the swipe is armed for `total` travel (drives the haptic and the button fill). */
export function stagedArmed(
  total: number,
  width: number,
  wasOpen: boolean,
): 'left' | 'right' | null {
  if (total <= -fullSwipeThreshold(width)) return 'left';
  if (!wasOpen && total >= swipeThreshold(width)) return 'right';
  return null;
}
