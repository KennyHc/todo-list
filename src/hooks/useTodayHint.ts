import { useEffect } from 'react';
import { completedTodayCount } from '../lib/today';
import { useSessionStore } from '../store/session';
import { useTaskStore } from '../store/tasks';
import { setTodayView, useUIStore } from '../store/ui';
import { useSyncStore } from '../sync/status';
import { useToday } from './useToday';

/** Completions in a day that make it a "busy day". */
export const BUSY_DAY = 5;

export const TODAY_HINT = 'Busy day! Want a daily plan sized to your capacity?';

const markOffered = () => useTaskStore.getState().setSetting({ hints: { todayOffered: true } });

/**
 * The one well-timed pointer to the Today view: once the user has finished {BUSY_DAY} tasks in a
 * day and the feature is off, offer it in a dismissible notice. Dismissing it, or taking it up,
 * is remembered in the synced settings, so it is never offered again on any device. Nothing is
 * shown before the first sync settles, because the answer may be waiting in the cloud, nor
 * while the Undo toast is up.
 */
export function useTodayHint(): void {
  const synced = useSyncStore((s) => s.syncStatus !== 'loading');
  const todayView = useTaskStore((s) => s.settings.todayView);
  const offered = useTaskStore((s) => s.settings.hints.todayOffered === true);
  const today = useToday();
  const completed = useTaskStore((s) => completedTodayCount(s.history, today));
  // The Undo toast sits in the same spot; the hint waits for it to go.
  const quiet = useTaskStore((s) => s.undo === null);

  useEffect(() => {
    if (!synced || !quiet || todayView || offered || completed < BUSY_DAY) return;
    const session = useSessionStore.getState();
    if (session.todayHintShown) return;
    useSessionStore.setState({ todayHintShown: true });
    useUIStore.getState().showNotice(TODAY_HINT, {
      persistent: true,
      action: {
        label: 'Try Today view',
        run: () => {
          markOffered();
          setTodayView(true);
        },
      },
      onDismiss: markOffered,
    });
  }, [synced, quiet, todayView, offered, completed]);
}
