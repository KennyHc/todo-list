import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { AnimatedNumber } from './components/AnimatedNumber';
import { DeadlineList } from './components/DeadlineList';
import { CopyForAiDialog } from './components/CopyForAiDialog';
import { ExportBackupDialog } from './components/ExportBackupDialog';
import { ImportDialog } from './components/ImportDialog';
import { ImportFromAiDialog } from './components/ImportFromAiDialog';
import { CommandPalette } from './components/CommandPalette';
import { EmptyState } from './components/EmptyState';
import { MigrationToast } from './components/MigrationToast';
import { NoticeToast } from './components/NoticeToast';
import { HistoryList } from './components/HistoryList';
import { ProgressRing } from './components/ProgressRing';
import { SettingsPopover } from './components/SettingsPopover';
import { ShortcutsSheet } from './components/ShortcutsSheet';
import { TaskInput } from './components/TaskInput';
import { TaskList } from './components/TaskList';
import { ThemeToggle } from './components/ThemeToggle';
import { UndoToast } from './components/UndoToast';
import { ViewToolbar } from './components/ViewToolbar';
import { useHotkeys } from './hooks/useHotkeys';
import { usePasteImport } from './hooks/usePasteImport';
import { useAuthStore } from './store/auth';
import { useUIStore } from './store/ui';
import { useTaskStore, useTotals } from './store/tasks';
import styles from './App.module.css';

const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

function App() {
  const isEmpty = useTaskStore((s) => s.rootIds.length === 0);
  const hasHistory = useTaskStore((s) => s.history.length > 0);
  const view = useUIStore((s) => s.view);
  const freshSignIn = useAuthStore((s) => s.freshSignIn);
  const { openDifficulty, done, total } = useTotals();
  useHotkeys();
  usePasteImport();

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
            <SettingsPopover />
            <ThemeToggle />
          </div>
        </header>
        <TaskInput autoFocus={freshSignIn} />
        {isEmpty && !hasHistory ? (
          <EmptyState welcome={freshSignIn} />
        ) : (
          <>
            <ViewToolbar />
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.16 }}
              >
                {view === 'history' ? (
                  <HistoryList />
                ) : isEmpty ? (
                  <EmptyState welcome={freshSignIn} />
                ) : view === 'deadline' ? (
                  <DeadlineList />
                ) : (
                  <TaskList />
                )}
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </main>
      <UndoToast />
      <MigrationToast />
      <NoticeToast />
      <CommandPalette />
      <ShortcutsSheet />
      <CopyForAiDialog />
      <ImportFromAiDialog />
      <ExportBackupDialog />
      <ImportDialog />
    </MotionConfig>
  );
}

export default App;
