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
          <p className={styles.empty}>Nothing here yet. Add your first task above.</p>
        ) : (
          <TaskList />
        )}
      </main>
    </MotionConfig>
  );
}

export default App;
