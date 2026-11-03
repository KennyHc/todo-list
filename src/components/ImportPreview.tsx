import { Info } from 'lucide-react';
import { importStats, type AiImportTask } from '../lib/ai';
import { DuePill } from './DuePill';
import { TagChip } from './TagChip';
import styles from './ImportPreview.module.css';

const PREVIEW_ROWS = 12;

type PreviewRow = { task: AiImportTask; depth: number };

function flatten(tasks: AiImportTask[], depth = 0, out: PreviewRow[] = []): PreviewRow[] {
  for (const task of tasks) {
    out.push({ task, depth });
    flatten(task.subtasks, depth + 1, out);
  }
  return out;
}

const sumDifficulty = (task: AiImportTask): number =>
  task.subtasks.length === 0
    ? task.difficulty
    : task.subtasks.reduce((n, t) => n + sumDifficulty(t), 0);

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The parsed import as a compact tree, with the parser's warnings underneath. */
export function ImportPreview({ tasks, warnings }: { tasks: AiImportTask[]; warnings: string[] }) {
  const stats = importStats(tasks);
  const rows = flatten(tasks);
  const shown = rows.slice(0, PREVIEW_ROWS);
  return (
    <div className={styles.preview}>
      <div className={styles.previewHead}>
        <strong>{plural(stats.count, 'task', 'tasks')}</strong>
        <span className={styles.sigma}>
          {'·'} {'Σ'} {stats.difficulty} difficulty
        </span>
      </div>
      <ul className={styles.tree} aria-label="Preview">
        {shown.map(({ task, depth }, i) => (
          <li key={i} className={styles.row} style={{ paddingLeft: depth * 16 }}>
            <span className={`${styles.rowTitle} ${task.done ? styles.rowDone : ''}`}>
              {task.title}
            </span>
            {task.tags.slice(0, 2).map((tag) => (
              <TagChip key={tag} tag={tag} hash />
            ))}
            {task.due && <DuePill dueDate={task.due} done={task.done} repeat={task.repeat} />}
            <span className={styles.badge} title="Difficulty">
              {sumDifficulty(task)}
            </span>
          </li>
        ))}
      </ul>
      {rows.length > shown.length && (
        <div className={styles.more}>+ {rows.length - shown.length} more</div>
      )}
      {warnings.length > 0 && (
        <ul className={styles.warnings}>
          {warnings.map((warning) => (
            <li key={warning}>
              <Info size={13} strokeWidth={1.75} aria-hidden="true" />
              {warning}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
