import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { ChevronRight } from 'lucide-react';
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
 * Inside it t, m, w and n pick the first four.
 */
export function RescheduleMenu({ id, open, onClose, anchorRef, align = 'end' }: Props) {
  const task = useTask(id);
  const [picking, setPicking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const today = todayISO();
  const picks = quickPicks(today);
  const dueDate = task?.dueDate ?? null;

  // Reopens on the quick picks, not on the date input.
  useEffect(() => {
    if (!open) setPicking(false);
  }, [open]);

  const choose = useCallback(
    (date: string | null) => {
      onClose();
      useTaskStore.getState().reschedule(id, date);
    },
    [id, onClose],
  );

  useEffect(() => {
    if (!open || picking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || isTypingKey(e)) return;
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
  }, [open, picking, choose]);

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
      <h3 className={styles.heading}>Reschedule</h3>
      {picking ? (
        <DatePicker
          value={null}
          onChange={(date) => {
            // Typing a year passes through 0002, 0020, ...: wait for a real one.
            if (date !== null && date >= '1000-01-01') choose(date);
          }}
          onPicked={onClose}
        />
      ) : (
        <div ref={listRef} className={styles.list} role="menu" aria-label="Reschedule">
          {picks.map((pick) => (
            <button
              key={pick.key}
              type="button"
              role="menuitem"
              className={styles.item}
              data-current={dueDate === pick.date || undefined}
              onClick={() => choose(pick.date)}
            >
              <span>{pick.label}</span>
              <span className={styles.date}>{pickDateLabel(pick.date)}</span>
            </button>
          ))}
          <div className={styles.divider} role="separator" />
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => setPicking(true)}
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
        </div>
      )}
    </Popover>
  );
}
