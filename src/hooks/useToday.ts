import { useEffect } from 'react';
import { todayISO } from '../lib/views';
import { useUIStore } from '../store/ui';

/** Milliseconds from `now` to the next local midnight (DST-safe: built from calendar fields). */
export function msUntilMidnight(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}

/** Puts the real date into the UI store if it has moved on. */
export function syncToday(): void {
  useUIStore.getState().setToday(todayISO());
}

let users = 0;
let stopClock: (() => void) | null = null;

/**
 * Keeps `ui.today` current: a timeout to the next local midnight (rescheduled each time it fires)
 * plus a recheck on `visibilitychange` and `focus`, since phones sleep and timers drift.
 * Returns a function that stops it.
 */
function startClock(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    clearTimeout(timer);
    // A little past midnight, so an early-firing timer never lands on the old day.
    timer = setTimeout(tick, msUntilMidnight() + 50);
  };
  const tick = () => {
    syncToday();
    schedule();
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') tick();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', tick);
  tick();
  return () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', tick);
  };
}

/**
 * Today's local date as `YYYY-MM-DD`; the component re-renders when the day changes. Use it for
 * anything rendered against "today" (labels, overdue, views). Write paths (timestamps, the date a
 * new task gets) keep calling todayISO(). One shared clock runs while any component uses this.
 */
export function useToday(): string {
  useEffect(() => {
    users += 1;
    if (users === 1) stopClock = startClock();
    return () => {
      users -= 1;
      if (users === 0) {
        stopClock?.();
        stopClock = null;
      }
    };
  }, []);
  return useUIStore((s) => s.today);
}
