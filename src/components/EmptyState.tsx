import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { dur, ease } from '../styles/motion';
import styles from './EmptyState.module.css';

/** The check that draws itself, timed to start as the card finishes fading in. */
function DrawnCheck() {
  const reduced = useReducedMotion();
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <motion.path
        d="M5 12.5l4.5 4.5L19 7.5"
        initial={reduced ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: dur.slow * 2, ease: ease.out, delay: 0.82 }}
      />
    </svg>
  );
}

type Props = {
  /** A brand-new account: the welcome copy. */
  welcome?: boolean;
  /** The list was just cleared by completing tasks: a calm "nice work". */
  celebrate?: boolean;
};

export function EmptyState({ welcome = false, celebrate = false }: Props) {
  const nice = celebrate && !welcome;
  return (
    <div className={styles.card}>
      <div className={styles.icon}>
        {nice ? <DrawnCheck /> : <Check size={18} strokeWidth={2} aria-hidden="true" />}
      </div>
      <p className={styles.title}>
        {welcome ? "What's on your mind?" : nice ? 'All clear. Nice work.' : 'All clear'}
      </p>
      <p className={styles.hint}>
        {welcome
          ? 'Type a task above and press Enter.'
          : nice
            ? 'Add a task above, or enjoy the moment.'
            : 'Add a task above. Big ones can be broken into subtasks.'}
      </p>
    </div>
  );
}
