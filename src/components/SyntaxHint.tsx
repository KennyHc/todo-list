import { Fragment } from 'react';
import type { QuickToken } from '../lib/quickAdd';
import styles from './SyntaxHint.module.css';

type Hint = {
  name: string;
  /** What `parseQuickAdd` turns each form into; SyntaxHint.test.tsx checks every one. */
  kind: QuickToken['kind'];
  forms: string[];
  /** Show the forms as a range ("!1 – !5") instead of a list. */
  range?: boolean;
  example: string;
};

/** Only what `parseQuickAdd` already understands. */
export const SYNTAX_HINTS: Hint[] = [
  { name: 'Tag', kind: 'tag', forms: ['#tag'], example: 'Pay rent #home' },
  {
    name: 'Difficulty',
    kind: 'difficulty',
    forms: ['!1', '!5'],
    range: true,
    example: 'Draft report !3',
  },
  {
    name: 'Due date',
    kind: 'date',
    forms: ['tomorrow', 'fri', 'next week', 'in 3 days', 'oct 24'],
    example: 'Call mum tomorrow',
  },
  {
    name: 'Repeat',
    kind: 'repeat',
    forms: ['daily', 'weekdays', 'every monday', 'monthly'],
    example: 'Gym every monday',
  },
  {
    name: 'Hidden until',
    kind: 'start',
    forms: ['from nov 1'],
    example: 'Renew passport from nov 1 by nov 30',
  },
];

/** The composer's "?" popover: the shorthand the task field understands. */
export function SyntaxHint() {
  return (
    <div className={styles.hint}>
      <p className={styles.lead}>Type these in a task. Each one turns into a chip.</p>
      <ul className={styles.list}>
        {SYNTAX_HINTS.map((h) => (
          <li key={h.name} className={styles.row}>
            <span className={styles.name}>{h.name}</span>
            <span className={styles.forms}>
              {h.forms.map((f, i) => (
                <Fragment key={f}>
                  {i > 0 && (h.range ? <span aria-label="to"> – </span> : ' ')}
                  <code className={styles.code}>{f}</code>
                </Fragment>
              ))}
            </span>
            <span className={styles.example}>e.g. {h.example}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
