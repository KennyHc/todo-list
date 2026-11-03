import { AnimatePresence, motion } from 'framer-motion';
import styles from './AnimatedNumber.module.css';
import { spring } from '../styles/motion';

/** A number that slides up and crossfades whenever its value changes. */
export function AnimatedNumber({ value }: { value: number }) {
  return (
    <span className={styles.slot}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          className={styles.digit}
          initial={{ y: '60%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-60%', opacity: 0 }}
          transition={spring.snappy}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
