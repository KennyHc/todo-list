import { DEFAULT_SETTINGS, MAX_CAPACITY, MIN_CAPACITY, type Settings } from '../types';

/** A partial update: `hints` is merged, not replaced. */
export type SettingsPatch = Partial<Omit<Settings, 'hints'>> & { hints?: Settings['hints'] };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const clampCapacity = (n: number): number =>
  Math.min(MAX_CAPACITY, Math.max(MIN_CAPACITY, Math.round(n)));

/**
 * Defensive read of a stored `settings` map (Firestore, a backup, or anything else): unknown
 * keys are dropped, bad values fall back to the defaults, and the capacity is clamped. Absent
 * means the defaults.
 */
export function normalizeSettings(raw: unknown): Settings {
  if (!isRecord(raw)) return { ...DEFAULT_SETTINGS, hints: {} };
  const capacity = raw.dailyCapacity;
  const hints = isRecord(raw.hints) ? raw.hints : {};
  return {
    todayView: raw.todayView === true,
    dailyCapacity:
      typeof capacity === 'number' && Number.isFinite(capacity)
        ? clampCapacity(capacity)
        : DEFAULT_SETTINGS.dailyCapacity,
    hints: hints.todayOffered === true ? { todayOffered: true } : {},
  };
}

export function isEqualSettings(a: Settings, b: Settings): boolean {
  return (
    a === b ||
    (a.todayView === b.todayView &&
      a.dailyCapacity === b.dailyCapacity &&
      (a.hints.todayOffered ?? false) === (b.hints.todayOffered ?? false))
  );
}

/** `current` with `patch` applied; the same object when nothing changes. */
export function applySettingsPatch(current: Settings, patch: SettingsPatch): Settings {
  const next = normalizeSettings({
    ...current,
    ...patch,
    hints: { ...current.hints, ...patch.hints },
  });
  return isEqualSettings(current, next) ? current : next;
}
