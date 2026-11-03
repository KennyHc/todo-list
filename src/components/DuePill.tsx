import { Calendar } from 'lucide-react';
import { dueLabel } from '../lib/dates';
import { dueStatus, todayISO } from '../lib/views';
import styles from './DuePill.module.css';

type Props = { dueDate: string; done?: boolean };

export function DuePill({ dueDate, done }: Props) {
  const today = todayISO();
  const status = done ? 'done' : dueStatus(dueDate, today);
  return (
    <span className={`${styles.pill} ${styles[status ?? 'later']}`} title={`Due ${dueDate}`}>
      <Calendar size={12} strokeWidth={1.75} aria-hidden="true" />
      <span>{dueLabel(dueDate, today)}</span>
    </span>
  );
}
