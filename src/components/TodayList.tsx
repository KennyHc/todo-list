import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { Plus, Sun, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useCompletionHold } from '../hooks/useCompletionHold';
import { useSettledOrder } from '../hooks/useSettledOrder';
import { dueLabel } from '../lib/dates';
import {
  meterShape,
  overflowIds,
  suggestions,
  todayList,
  todayLoad,
  type TodayLoad,
} from '../lib/today';
import { todayReason } from '../lib/todayReason';
import { effectiveDifficulty } from '../lib/tree';
import { taskPath } from '../lib/views';
import { dismissSuggestion, useSessionStore } from '../store/session';
import { useTask, useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';
import type { Difficulty } from '../types';
import { DifficultyGlyph } from './DifficultyGlyph';
import { TaskItem } from './TaskItem';
import styles from './TodayList.module.css';
import { dur, ease, spring } from '../styles/motion';
import { useToday } from '../hooks/useToday';

const MAX_SUGGESTIONS = 3;
/** How long "move something" keeps the over-capacity rows tinted. */
const HIGHLIGHT_MS = 4000;
const NONE: string[] = [];

const pct = (fraction: number) => `${(fraction * 100).toFixed(2)}%`;

/** "Today · 5 of 8 points done · 3 planned", the capacity meter and, when over, the nudge. */
function Header({
  load,
  highlighting,
  onHighlight,
}: {
  load: TodayLoad;
  highlighting: boolean;
  onHighlight: () => void;
}) {
  const shape = meterShape(load);
  return (
    <div className={styles.head}>
      <p className={styles.line}>
        Today {'·'} <span className={styles.num}>{load.done}</span> of {load.capacity} points done
        {load.open > 0 && (
          <span className={styles.planned}>
            {' '}
            {'·'} {load.open} planned
          </span>
        )}
      </p>
      <div
        className={styles.meter}
        role="meter"
        aria-label="Today's load"
        aria-valuemin={0}
        aria-valuemax={load.capacity}
        aria-valuenow={Math.min(load.done, load.capacity)}
        aria-valuetext={`${load.done} of ${load.capacity} points done, ${load.open} planned`}
        data-over={shape.overBy > 0 || undefined}
      >
        <span className={styles.done} style={{ width: pct(shape.done) }} />
        <span
          className={styles.open}
          style={{ left: pct(shape.done), width: pct(shape.planned) }}
        />
        <span
          className={styles.overSegment}
          style={{ left: pct(shape.done + shape.planned), width: pct(shape.over) }}
        />
        <span className={styles.mark} style={{ left: pct(shape.mark) }} aria-hidden="true" />
      </div>
      {shape.overBy > 0 && (
        <p className={styles.overLine} role="status">
          Over by {shape.overBy} {'—'}{' '}
          <button
            type="button"
            className={styles.link}
            aria-pressed={highlighting}
            onClick={onHighlight}
          >
            move something
          </button>{' '}
          to tomorrow?
        </p>
      )}
    </div>
  );
}

function TodayRow({ id, today, over }: { id: string; today: string; over: boolean }) {
  const task = useTask(id);
  const reason = task ? todayReason(task, today) : null;
  return (
    <TaskItem
      id={id}
      depth={0}
      flat
      exitStyle="pop"
      // A due-today row needs no date; overdue ones say it in the reason.
      section={task?.dueDate === today ? 'today' : undefined}
      reason={reason?.label}
      reasonDanger={reason?.danger}
      over={over}
      layoutId={`plan-${id}`}
    />
  );
}

/** A candidate for the day, in a lighter style than a row: "+" plans it for today. */
function SuggestionRow({ id, today }: { id: string; today: string }) {
  const task = useTask(id);
  const path = useTaskStore(useShallow((s) => taskPath(s, id)));
  const sum = useTaskStore((s) => effectiveDifficulty(s, id));
  const leaf = task !== undefined && task.childIds.length === 0;
  if (!task) return null;
  const meta = [
    ...(path.length > 0 ? [path.join(' › ')] : []),
    ...(task.dueDate !== null ? [dueLabel(task.dueDate, today)] : []),
  ].join(' · ');
  return (
    <motion.li
      className={styles.suggestion}
      data-row-id={id}
      layoutId={`plan-${id}`}
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: dur.fast, ease: ease.out } }}
      transition={spring.snappy}
    >
      <button
        type="button"
        className={styles.add}
        aria-label={`Plan “${task.title}” for today`}
        onClick={() => useTaskStore.getState().plan(id, today)}
      >
        <Plus size={14} strokeWidth={2} aria-hidden="true" />
      </button>
      <div className={styles.suggestText}>
        <span className={styles.suggestTitle}>{task.title}</span>
        {meta && <span className={styles.suggestMeta}>{meta}</span>}
      </div>
      {leaf ? (
        <DifficultyGlyph value={task.difficulty as Difficulty} />
      ) : (
        <span className={styles.sum}>
          {'Σ'} {sum}
        </span>
      )}
      <button
        type="button"
        className={styles.dismiss}
        aria-label={`Dismiss suggestion “${task.title}”`}
        onClick={() => dismissSuggestion(id)}
      >
        <X size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </motion.li>
  );
}

/** The Today view: the day's load, the rows in it, and a few suggestions while there is room. */
export function TodayList() {
  const tag = useUIStore((s) => s.tagFilter);
  const capacity = useTaskStore((s) => s.settings.dailyCapacity);
  const dismissed = useSessionStore((s) => s.dismissedSuggestions);
  const today = useToday();
  const [highlighting, setHighlighting] = useState(false);
  const suggestRef = useRef<HTMLElement>(null);

  const liveIds = useTaskStore(useShallow((s) => todayList(s, today, tag)));
  // A completed row is held (struck through) until its strike has played, then pops out.
  const settled = useSettledOrder(liveIds, 700);
  const ids = useCompletionHold(settled);

  const load = useTaskStore(useShallow((s) => todayLoad(s, s.history, today, capacity)));
  const left = capacity - load.open - load.done;
  const over = useTaskStore(
    useShallow((s) => (highlighting ? [...overflowIds(s, today, load)] : NONE)),
  );
  const suggested = useTaskStore(
    useShallow((s) =>
      suggestions(s, today, left, MAX_SUGGESTIONS + dismissed.length + 6)
        .filter((id) => !dismissed.includes(id) && (tag === null || s.tasks[id].tags.includes(tag)))
        .slice(0, MAX_SUGGESTIONS),
    ),
  );

  // The tint is a glance, not a mode: it fades after a few seconds, or once nothing is over.
  useEffect(() => {
    if (!highlighting) return;
    const timer = window.setTimeout(() => setHighlighting(false), HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [highlighting]);
  useEffect(() => {
    if (load.open + load.done <= load.capacity) setHighlighting(false);
  }, [load.open, load.done, load.capacity]);

  const planYourDay = () => {
    const block = suggestRef.current;
    block?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    block?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  };

  const empty = ids.length === 0;
  const finished = empty && load.done > 0;

  return (
    <LayoutGroup>
      <Header load={load} highlighting={highlighting} onHighlight={() => setHighlighting(true)} />
      <ul className={styles.list} data-empty={empty || undefined}>
        <AnimatePresence initial={false}>
          {ids.map((id) => (
            <TodayRow key={id} id={id} today={today} over={over.includes(id)} />
          ))}
        </AnimatePresence>
      </ul>
      {empty && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <Sun size={18} strokeWidth={1.75} aria-hidden="true" />
          </div>
          <p className={styles.emptyTitle}>
            {finished ? 'Nothing left for today' : 'Nothing planned for today'}
          </p>
          {suggested.length > 0 ? (
            <button type="button" className={styles.emptyAction} onClick={planYourDay}>
              Plan your day
            </button>
          ) : (
            <p className={styles.emptyHint}>
              Add tasks with <kbd>today</kbd> or <kbd>!n</kbd> in the composer
            </p>
          )}
        </div>
      )}
      <section
        ref={suggestRef}
        className={styles.suggest}
        aria-label="Suggested"
        hidden={suggested.length === 0}
      >
        <h3 className={styles.suggestHead}>
          Suggested
          <span className={styles.suggestLeft}>{left} points left</span>
        </h3>
        <ul className={styles.suggestList}>
          <AnimatePresence initial={false}>
            {suggested.map((id) => (
              <SuggestionRow key={id} id={id} today={today} />
            ))}
          </AnimatePresence>
        </ul>
      </section>
    </LayoutGroup>
  );
}
