import { useEffect, useState } from 'react';
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from 'framer-motion';
import { AnimatedNumber } from './components/AnimatedNumber';
import { DeadlineList } from './components/DeadlineList';
import { EmptyState } from './components/EmptyState';
import { MigrationToast } from './components/MigrationToast';
import { NoticeToast } from './components/NoticeToast';
import { OverdueNudge } from './components/OverdueNudge';
import { HistoryList } from './components/HistoryList';
import { ProgressRing } from './components/ProgressRing';
import { SettingsPopover } from './components/SettingsPopover';
import { LazyDialogs } from './components/LazyDialogs';
import { FocusProxy } from './components/FocusProxy';
import { TaskInput } from './components/TaskInput';
import { TaskList } from './components/TaskList';
import { TodayList } from './components/TodayList';
import { UndoToast } from './components/UndoToast';
import { ViewToolbar } from './components/ViewToolbar';
import { useHotkeys } from './hooks/useHotkeys';
import { useIsPhone } from './hooks/useMediaQuery';
import { usePasteImport } from './hooks/usePasteImport';
import { useTodayHint } from './hooks/useTodayHint';
import { useAuthStore } from './store/auth';
import { useSyncStore } from './sync/status';
import { useUIStore, useView } from './store/ui';
import { useTaskStore, useTotals } from './store/tasks';
import styles from './App.module.css';
import { useIntro } from './hooks/useIntro';
import { dur, ease } from './styles/motion';

const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

/** Past this much scroll the phone's large title has gone and the compact bar takes over. */
const COMPACT_AT = 40;

/** The window's scroll offset as a motion value, and whether the large title has scrolled away. */
function useScrollState() {
  const y = useMotionValue(typeof window === 'undefined' ? 0 : window.scrollY);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => y.set(window.scrollY);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [y]);
  useMotionValueEvent(y, 'change', (v) => setScrolled(v > COMPACT_AT));
  return { y, scrolled };
}

/** Phone: a translucent bar with the small centred title, faded in as the large title leaves. */
function CompactBar({ y }: { y: ReturnType<typeof useMotionValue<number>> }) {
  const opacity = useTransform(y, [COMPACT_AT - 16, COMPACT_AT + 16], [0, 1]);
  return (
    <motion.div
      className={styles.compact}
      style={{ opacity }}
      aria-hidden="true"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <span className={styles.compactTitle}>Tasks</span>
    </motion.div>
  );
}

function Controls() {
  const { openDifficulty, done, total } = useTotals();
  return (
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
    </div>
  );
}

function App() {
  const isEmpty = useTaskStore((s) => s.rootIds.length === 0);
  const hasHistory = useTaskStore((s) => s.history.length > 0);
  const view = useView();
  const tagFilter = useUIStore((s) => s.tagFilter);
  const freshSignIn = useAuthStore((s) => s.freshSignIn);
  const syncStatus = useSyncStore((s) => s.syncStatus);
  const phone = useIsPhone();
  const { y, scrolled } = useScrollState();
  useHotkeys();
  usePasteImport();
  useTodayHint();
  const intro = useIntro();

  return (
    <MotionConfig reducedMotion="user">
      <main
        className={intro ? 'app intro' : 'app'}
        data-sync={syncStatus}
        data-scrolled={(phone && scrolled) || undefined}
      >
        {phone && <CompactBar y={y} />}
        {phone && (
          // Sticky and zero-height: it rides on the large title's row, then stays put in the
          // compact bar, so there is only ever one account button.
          <div className={styles.pinned} data-intro="1">
            <Controls />
          </div>
        )}
        <header className={styles.header} data-intro="1">
          <div className={styles.heading}>
            <h1 className={styles.title}>Tasks</h1>
            <p className={styles.date}>{dateFormat.format(new Date())}</p>
          </div>
          {!phone && <Controls />}
        </header>
        <TaskInput autoFocus={freshSignIn} />
        {isEmpty && !hasHistory ? (
          <div data-intro="3">
            <EmptyState welcome={freshSignIn} />
          </div>
        ) : (
          <>
            <ViewToolbar />
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={view}
                data-intro="4"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4, transition: { duration: dur.fast, ease: ease.out } }}
                transition={{ duration: dur.base, ease: ease.out }}
              >
                {(view === 'tree' || view === 'deadline') && !isEmpty && (
                  <OverdueNudge tag={tagFilter} />
                )}
                {view === 'history' ? (
                  <HistoryList />
                ) : view === 'today' ? (
                  <TodayList />
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
      <LazyDialogs />
      <FocusProxy />
    </MotionConfig>
  );
}

export default App;
