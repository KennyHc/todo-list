/**
 * Motion tokens: the one set of eases, durations and springs the app animates with. The CSS
 * equivalents (--ease-*, --dur-*) live in theme.css; keep the two in step.
 */

/** Cubic-bezier control points. `out` is the default: fast start, soft landing. */
export const ease = {
  out: [0.2, 0.8, 0.2, 1],
  inOut: [0.4, 0, 0.2, 1],
  expoOut: [0.16, 1, 0.3, 1],
} as const;

/** Durations in seconds. */
export const dur = {
  fast: 0.12,
  base: 0.2,
  slow: 0.32,
} as const;

/** Springs. `snappy` for small controls, `gentle` for values, `layout` for rows, `pop` for pops. */
export const spring = {
  snappy: { type: 'spring', stiffness: 520, damping: 34 },
  gentle: { type: 'spring', stiffness: 300, damping: 30 },
  layout: { type: 'spring', stiffness: 380, damping: 34 },
  pop: { type: 'spring', stiffness: 600, damping: 22 },
} as const;

/** The pressed state shared by buttons, chips and menu items (CSS: `--press-scale`). */
export const press = { scale: 0.97 } as const;
