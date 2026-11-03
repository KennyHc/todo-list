import { Calendar, Hourglass, Repeat as RepeatIcon } from 'lucide-react';
import { normalizeTag } from '../lib/tags';
import type { QuickAdd, QuickToken } from '../lib/quickAdd';
import { dueStatus, todayISO } from '../lib/views';
import { DifficultyGlyph } from './DifficultyGlyph';
import { QuickChip } from './QuickChip';
import { TagChip } from './TagChip';
import styles from './QuickChips.module.css';

type Props = {
  parsed: QuickAdd;
  /** Dismisses tokens so they stay in the title as typed. */
  onIgnore: (...tokens: QuickToken[]) => void;
};

/**
 * What a quick-add line was recognised as, the same chips as the composer's, for the inline
 * title editor. Mouse down on a chip keeps focus in the editor, so dismissing one doesn't end
 * the edit.
 */
export function QuickChips({ parsed, onIgnore }: Props) {
  const find = (kind: QuickToken['kind']) => parsed.tokens.find((t) => t.kind === kind);
  const date = find('date');
  const start = find('start');
  const difficulty = find('difficulty');
  const repeat = find('repeat');
  const tagTokens = parsed.tokens.filter((t) => t.kind === 'tag');
  if (parsed.tokens.length === 0) return null;

  return (
    <ul
      className={styles.chips}
      aria-label="Recognised in this task"
      onMouseDown={(e) => e.preventDefault()}
    >
      {date && parsed.dueDate && (
        <li className={styles.item}>
          <QuickChip
            icon={<Calendar size={12} strokeWidth={1.75} aria-hidden="true" />}
            label={date.label}
            accent={dueStatus(parsed.dueDate, todayISO()) === 'today'}
            removeLabel={`Don't treat "${date.raw}" as a due date`}
            onRemove={() => onIgnore(date)}
          />
        </li>
      )}
      {start && parsed.startDate && (
        <li className={styles.item}>
          <QuickChip
            icon={<Hourglass size={12} strokeWidth={1.75} aria-hidden="true" />}
            label={start.label}
            title="Hidden until this day"
            removeLabel={`Don't treat "${start.raw}" as a start date`}
            onRemove={() => onIgnore(start)}
          />
        </li>
      )}
      {difficulty && parsed.difficulty && (
        <li className={styles.item}>
          <QuickChip
            icon={<DifficultyGlyph value={parsed.difficulty} />}
            label={String(parsed.difficulty)}
            title={difficulty.label}
            removeLabel={`Don't treat "${difficulty.raw}" as a difficulty`}
            onRemove={() => onIgnore(difficulty)}
          />
        </li>
      )}
      {repeat && parsed.repeat && (
        <li className={styles.item}>
          <QuickChip
            icon={<RepeatIcon size={12} strokeWidth={1.75} aria-hidden="true" />}
            label={repeat.label}
            removeLabel={`Don't treat "${repeat.raw}" as a repeat`}
            onRemove={() => onIgnore(repeat)}
          />
        </li>
      )}
      {parsed.tags.map((tag) => (
        <li key={tag} className={styles.item}>
          <TagChip
            tag={tag}
            onRemove={() => onIgnore(...tagTokens.filter((t) => normalizeTag(t.raw) === tag))}
          />
        </li>
      ))}
    </ul>
  );
}
