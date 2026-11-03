import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { todayISO, upcomingCount } from '../lib/views';
import { useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';
import styles from './UpcomingFooter.module.css';
import { dur, ease } from '../styles/motion';

/**
 * The Tree's quiet last line, only while tasks are hidden by a start date: "3 starting later ·
 * Show". Show lists them inline, dimmed, and Hide puts them away again. Nothing without any.
 */
export function UpcomingFooter() {
  const tag = useUIStore((s) => s.tagFilter);
  const show = useUIStore((s) => s.showUpcoming);
  const count = useTaskStore((s) => upcomingCount(s, todayISO(), tag));

  // With nothing left to reveal, the toggle goes back to off, so the next one starts hidden.
  useEffect(() => {
    if (count === 0 && show) useUIStore.getState().setShowUpcoming(false);
  }, [count, show]);

  if (count === 0) return null;
  return (
    <motion.p
      className={styles.footer}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: dur.base, ease: ease.out }}
    >
      {count} starting later {'·'}{' '}
      <button
        type="button"
        className={styles.toggle}
        aria-pressed={show}
        onClick={() => useUIStore.getState().setShowUpcoming(!show)}
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </motion.p>
  );
}
