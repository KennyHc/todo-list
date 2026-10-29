import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, parseISO } from '../lib/dates';
import { todayReason } from '../lib/todayReason';
import { todayISO } from '../lib/views';
import { weekDays, weekRange, weekStart, type WeekDay, type WeekItem } from '../lib/week';
import { useTask, useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';
import { dur, ease } from '../styles/motion';
import { TaskItem } from './TaskItem';
import styles from './WeekView.module.css';

const weekdayShort = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const weekdayLong = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const monthDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

function WeekBar({ start, current }: { start: string; current: string }) {
  const setAnchor = useUIStore((s) => s.setWeekAnchor);
  // The current week is "follow today" (null), so the view stays right past midnight.
  const go = (next: string) => setAnchor(next === current ? null : next);
  const here = start === current;
  return (
    <div className={styles.bar}>
      <h2 className={styles.range} aria-live="polite">
        {weekRange(start, todayISO())}
      </h2>
      <div className={styles.nav} role="group" aria-label="Week">
        <button
          type="button"
          className={styles.navBtn}
          aria-label="Previous week"
          onClick={() => go(addDays(start, -7))}
        >
          <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.todayBtn}
          disabled={here}
          onClick={() => go(current)}
        >
          Today
        </button>
        <button
          type="button"
          className={styles.navBtn}
          aria-label="Next week"
          onClick={() => go(addDays(start, 7))}
        >
          <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** One row of a day: a due task, or a plan for the day in the quiet style. */
function DayRow({ item, today }: { item: WeekItem; today: string }) {
  const task = useTask(item.id);
  // A plan that rolled over from an earlier day says so ("From Mon"), as in Today.
  const reason = task && item.carried ? todayReason(task, today) : null;
  return (
    <TaskItem
      id={item.id}
      depth={0}
      flat
      exitStyle="move"
      // A due row sits under its date already; a plan keeps its due pill to say when it is due.
      section={item.kind === 'due' ? 'today' : undefined}
      quiet={item.kind === 'planned'}
      compact
      reason={reason?.label}
      reasonDanger={reason?.danger}
    />
  );
}

function Day({ day, today }: { day: WeekDay; today: string }) {
  const date = parseISO(day.date);
  return (
    <section
      className={styles.day}
      data-today={day.isToday || undefined}
      data-past={day.date < today || undefined}
      data-date={day.date}
      aria-label={`${weekdayLong.format(date)}, ${monthDay.format(date)}`}
      aria-current={day.isToday ? 'date' : undefined}
    >
      <header className={styles.dayHead}>
        <span className={styles.dow}>{weekdayShort.format(date)}</span>
        <span className={styles.date}>{monthDay.format(date)}</span>
        <span
          className={styles.points}
          data-zero={day.points === 0 || undefined}
          aria-label={`${day.points} ${day.points === 1 ? 'point' : 'points'}`}
        >
          {day.points} {day.points === 1 ? 'pt' : 'pts'}
        </span>
      </header>
      <ul className={styles.rows}>
        <AnimatePresence initial={false}>
          {day.items.map((item) => (
            <DayRow key={`${item.kind}:${item.id}`} item={item} today={today} />
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

/** The Week view: Monday to Sunday, each day listing the tasks due or planned for it. */
export function WeekView() {
  const tag = useUIStore((s) => s.tagFilter);
  const anchor = useUIStore((s) => s.weekAnchor);
  const tasks = useTaskStore((s) => s.tasks);
  const rootIds = useTaskStore((s) => s.rootIds);
  const today = todayISO();
  const current = weekStart(today);
  const start = anchor ?? current;
  const days = useMemo(
    () => weekDays({ tasks, rootIds }, start, today, tag),
    [tasks, rootIds, start, today, tag],
  );
  const empty = days.every((day) => day.items.length === 0);

  return (
    <div className={styles.week}>
      <WeekBar start={start} current={current} />
      <motion.div
        key={start}
        className={styles.grid}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: dur.base, ease: ease.out }}
      >
        {days.map((day) => (
          <Day key={day.date} day={day} today={today} />
        ))}
      </motion.div>
      {empty && (
        <p className={styles.empty}>
          <CalendarDays size={14} strokeWidth={1.75} aria-hidden="true" />
          {tag === null ? 'Nothing due or planned this week' : `Nothing tagged #${tag} this week`}
        </p>
      )}
    </div>
  );
}
