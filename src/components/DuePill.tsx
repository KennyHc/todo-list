import { Calendar, Repeat as RepeatIcon } from 'lucide-react';
import { dueLabel } from '../lib/dates';
import { repeatPhrase } from '../lib/recur';
import { dueStatus, todayISO } from '../lib/views';
import type { Repeat } from '../types';
import styles from './DuePill.module.css';

type Props = { dueDate: string; done?: boolean; repeat?: Repeat | null };

export function DuePill({ dueDate, done, repeat = null }: Props) {
  const today = todayISO();
  const status = done ? 'done' : dueStatus(dueDate, today);
  const label = dueLabel(dueDate, today);
  return (
    <span
      className={`${styles.pill} ${styles[status ?? 'later']}`}
      title={`Due ${dueDate}`}
      role={repeat ? 'img' : undefined}
      aria-label={repeat ? `Due ${label}, repeats ${repeatPhrase(repeat)}` : undefined}
    >
      {repeat ? (
        <RepeatIcon size={12} strokeWidth={1.75} aria-hidden="true" data-testid="repeat-icon" />
      ) : (
        <Calendar size={12} strokeWidth={1.75} aria-hidden="true" />
      )}
      <span>{label}</span>
    </span>
  );
}
