import { motion } from 'framer-motion';
import styles from './Sparks.module.css';

type Props = {
  /** Seeds the spread, so a task always bursts the same way. */
  seed: string;
  /** Burst origin (the checkbox centre) in px, relative to the positioned parent. */
  x: number;
  y: number;
  /** The row's effective colour; falls back to the accent. */
  color: string | null;
  /** Seconds before the burst starts. */
  delay: number;
};

const COUNT = 6;
export const SPARK_SECONDS = 0.26;
const MIN_DISTANCE = 14;
const MAX_DISTANCE = 22;

/** Small deterministic PRNG (mulberry32) so the burst is stable per task id. */
function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where each spark lands: evenly spread around the circle, nudged, 14-22px out. */
export function sparkVectors(seed: string): { dx: number; dy: number }[] {
  const random = rng(seed);
  return Array.from({ length: COUNT }, (_, i) => {
    const angle = (i / COUNT) * Math.PI * 2 + (random() - 0.5) * 0.7;
    const distance = MIN_DISTANCE + random() * (MAX_DISTANCE - MIN_DISTANCE);
    return { dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance };
  });
}

/** Six tiny dots bursting outward from the checkbox as a completed row pops. */
export function Sparks({ seed, x, y, color, delay }: Props) {
  return (
    <span className={styles.sparks} style={{ left: x, top: y }} aria-hidden="true">
      {sparkVectors(seed).map(({ dx, dy }, i) => (
        <motion.span
          key={i}
          className={styles.dot}
          style={{ background: color ?? 'var(--accent)' }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 1 }}
          animate={{ x: dx, y: dy, opacity: [0, 1, 0], scale: [1, 1, 0.4] }}
          transition={{
            duration: SPARK_SECONDS,
            delay,
            ease: 'easeOut',
            opacity: { duration: SPARK_SECONDS, delay, times: [0, 0.25, 1], ease: 'easeOut' },
            scale: { duration: SPARK_SECONDS, delay, times: [0, 0.25, 1], ease: 'easeOut' },
          }}
        />
      ))}
    </span>
  );
}
