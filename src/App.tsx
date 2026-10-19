import { MotionConfig } from 'framer-motion';
import { AnimatedNumber } from './components/AnimatedNumber';
import { EmptyState } from './components/EmptyState';
import { ProgressRing } from './components/ProgressRing';
import { TaskInput } from './components/TaskInput';
import { TaskList } from './components/TaskList';
import { ThemeToggle } from './components/ThemeToggle';
import { useTaskStore, useTotals } from './store/tasks';
import styles from './App.module.css';

const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

function App() {
  const isEmpty = useTaskStore((s) => s.rootIds.length === 0);
  const { openDifficulty, done, total } = useTotals();

  return (
    <MotionConfig reducedMotion="user">
      <main className="app">
        <header className={styles.header}>
          <div className={styles.heading}>
            <h1 className={styles.title}>Tasks</h1>
            <p className={styles.date}>{dateFormat.format(new Date())}</p>
          </div>
          <div className={styles.controls}>
            {total > 0 && (
              <div className={styles.stats}>
                <ProgressRing value={done / total} />
                <span className={styles.count}>
                  <AnimatedNumber value={done} />/<AnimatedNumber value={total} />
                </span>
                <span className={styles.pill}>
                  Load <AnimatedNumber value={openDifficulty} />
                </span>
              </div>
            )}
            <ThemeToggle />
          </div>
        </header>
        <TaskInput />
        {isEmpty ? <EmptyState /> : <TaskList />}
      </main>
    </MotionConfig>
  );
}

export default App;
