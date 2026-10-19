import { MotionConfig } from 'framer-motion';
import { AnimatedNumber } from './components/AnimatedNumber';
import { TaskInput } from './components/TaskInput';
import { TaskList } from './components/TaskList';
import { useTaskStore, useTotals } from './store/tasks';
import styles from './App.module.css';

function App() {
  const isEmpty = useTaskStore((s) => s.rootIds.length === 0);
  const { openDifficulty, done, total } = useTotals();

  return (
    <MotionConfig reducedMotion="user">
      <main className="app">
        <header className={styles.header}>
          <h1 className={styles.title}>Tasks</h1>
          {total > 0 && (
            <p className={styles.stat}>
              Open difficulty <AnimatedNumber value={openDifficulty} /> ·{' '}
              <AnimatedNumber value={done} />/
              <AnimatedNumber value={total} /> done
            </p>
          )}
        </header>
        <TaskInput />
        {isEmpty ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
                <path
                  d="M 5 13 L 9 17 L 19 7"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className={styles.emptyTitle}>Nothing here yet</p>
            <p className={styles.emptyHint}>
              Add a task above — big ones can be broken into subtasks.
            </p>
          </div>
        ) : (
          <TaskList />
        )}
      </main>
    </MotionConfig>
  );
}

export default App;
