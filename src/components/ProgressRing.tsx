import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ease, spring } from '../styles/motion';
import styles from './ProgressRing.module.css';

const SIZE = 28;
const STROKE = 2.5;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const GLOW_MS = 600;

/**
 * Circular progress indicator. The arc eases to its new length with a gentle spring, and when the
 * value goes up the ring gives off a brief, soft glow in the accent colour.
 */
export function ProgressRing({ value, label }: { value: number; label?: string }) {
  const v = Math.min(1, Math.max(0, value));
  const ref = useRef<SVGSVGElement>(null);
  const previous = useRef(v);
  const reduced = useReducedMotion();

  useEffect(() => {
    const grew = v > previous.current;
    previous.current = v;
    const el = ref.current;
    if (!grew || reduced || !el || typeof el.animate !== 'function') return;
    const glow = (alpha: number, blur: number) =>
      `drop-shadow(0 0 ${blur}px color-mix(in srgb, var(--accent) ${alpha}%, transparent))`;
    const animation = el.animate(
      [{ filter: glow(0, 0) }, { filter: glow(75, 6), offset: 0.3 }, { filter: glow(0, 8) }],
      { duration: GLOW_MS, easing: `cubic-bezier(${ease.out.join(', ')})` },
    );
    // Cancelling rejects `finished`; nobody is waiting on it.
    animation.finished?.catch(() => {});
    return () => {
      try {
        animation.cancel();
      } catch {
        // Not every environment implements cancel; the glow is decoration.
      }
    };
  }, [v, reduced]);

  return (
    <svg
      ref={ref}
      className={styles.ring}
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      aria-hidden="true"
    >
      {label && <title>{label}</title>}
      <circle className={styles.track} cx={SIZE / 2} cy={SIZE / 2} r={R} strokeWidth={STROKE} />
      <motion.circle
        className={styles.arc}
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={R}
        strokeWidth={STROKE}
        strokeDasharray={C}
        initial={false}
        animate={{ strokeDashoffset: C * (1 - v) }}
        transition={spring.gentle}
      />
    </svg>
  );
}
