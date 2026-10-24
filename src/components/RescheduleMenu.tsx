import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { ChevronRight, Sun } from 'lucide-react';
import { pickDateLabel, quickPicks } from '../lib/reschedule';
import { todayISO } from '../lib/views';
import { useTask, useTaskStore } from '../store/tasks';
import { DatePicker } from './DatePicker';
import { Popover } from './Popover';
import styles from './RescheduleMenu.module.css';

type Props = {
  id: string;
  open: boolean;
  onClose: () => void;
  /** The button, or row, the popover hangs off (on phones it is a sheet and this is unused). */
  anchorRef: RefObject<HTMLElement | null>;
  align?: 'start' | 'end';
};

const isTypingKey = (e: KeyboardEvent) => e.metaKey || e.ctrlKey || e.altKey || e.shiftKey;

/**
 * "Move to": Today, Tomorrow, This weekend, Next week, a date of your choice, or no date. Each
 * quick pick shows the date it resolves to; choosing one records an undo ("Moved "X" to Sat, Oct 24").
 * Inside it t, m, w and n pick the first four. With the Today view on, "Plan for today" tops the
 * list (p) and the first pick reads "Due today": planning keeps the due date as it is. "Hide
 * until…" opens the date picker for the day the task starts (it stays out of the lists until
 * then), and "Show now" clears that day.
 */
export function RescheduleMenu({ id, open, onClose, anchorRef, align = 'end' }: Props) {
  const task = useTask(id);
  /** The date picker is open: for the due date, or for the day the task starts. */
  const [picking, setPicking] = useState<'due' | 'start' | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const today = todayISO();
  const picks = quickPicks(today);
  const dueDate = task?.dueDate ?? null;
  const todayView = useTaskStore((s) => s.settings.todayView);
  const planned = task?.plannedFor != null && task.plannedFor <= today;

  // Reopens on the quick picks, not on the date input.
  useEffect(() => {
    if (!open) setPicking(null);
  }, [open]);

  const choose = useCallback(
    (date: string | null) => {
      onClose();
      useTaskStore.getState().reschedule(id, date);
    },
    [id, onClose],
  );

  const hide = useCallback(
    (date: string | null) => {
      onClose();
      useTaskStore.getState().hideUntil(id, date);
    },
    [id, onClose],
  );

  const plan = useCallback(() => {
    onClose();
    useTaskStore.getState().plan(id, todayISO());
  }, [id, onClose]);

  useEffect(() => {
    if (!open || picking !== null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || isTypingKey(e)) return;
      if (todayView && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        plan();
        return;
      }
      const hit = quickPicks(todayISO()).find((p) => p.hotkey === e.key.toLowerCase());
      if (hit) {
        e.preventDefault();
        choose(hit.date);
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const items = [
        ...(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
      ];
      if (items.length === 0) return;
      const at = items.indexOf(document.activeElement as HTMLElement);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      items[
        at === -1 ? (step === 1 ? 0 : items.length - 1) : (at + step + items.length) % items.length
      ].focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, picking, choose, plan, todayView]);

  if (!task) return null;

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      label="Reschedule"
      align={align}
      width={248}
    >
      <h3 className={styles.heading}>{picking === 'start' ? 'Hide until' : 'Reschedule'}</h3>
      {picking !== null ? (
        <DatePicker
          inputLabel={picking === 'start' ? 'Hide until' : undefined}
          value={picking === 'start' ? task.startDate : null}
          onChange={(date) => {
            // Typing a year passes through 0002, 0020, ...: wait for a real one.
            if (picking === 'start') {
              if (date === null || date >= '1000-01-01') hide(date);
            } else if (date !== null && date >= '1000-01-01') choose(date);
          }}
          onPicked={onClose}
        />
      ) : (
        <div ref={listRef} className={styles.list} role="menu" aria-label="Reschedule">
          {todayView && (
            <>
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                data-current={planned || undefined}
                onClick={plan}
              >
                <span className={styles.planned}>
                  <Sun size={14} strokeWidth={1.75} aria-hidden="true" />
                  Plan for today
                </span>
              </button>
              <div className={styles.divider} role="separator" />
            </>
          )}
          {picks.map((pick) => (
            <button
              key={pick.key}
              type="button"
              role="menuitem"
              className={styles.item}
              data-current={dueDate === pick.date || undefined}
              onClick={() => choose(pick.date)}
            >
              <span>{todayView && pick.key === 'today' ? 'Due today' : pick.label}</span>
              <span className={styles.date}>{pickDateLabel(pick.date)}</span>
            </button>
          ))}
          <div className={styles.divider} role="separator" />
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => setPicking('due')}
          >
            <span>Pick date{'…'}</span>
            <ChevronRight
              className={styles.chevron}
              size={14}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </button>
          {dueDate !== null && (
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => choose(null)}
            >
              <span>Remove date</span>
            </button>
          )}
          <div className={styles.divider} role="separator" />
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => setPicking('start')}
          >
            <span>Hide until{'…'}</span>
            <ChevronRight
              className={styles.chevron}
              size={14}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </button>
          {task.startDate !== null && (
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => hide(null)}
            >
              <span>Show now</span>
            </button>
          )}
        </div>
      )}
    </Popover>
  );
}
