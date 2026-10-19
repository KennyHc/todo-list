import { jsonCandidates, parseAiImport, type AiImportTask } from './ai';
import { parseBackup } from './backup';
import type { PersistedTasks } from '../store/tasks';

export type ImportDetection =
  | { kind: 'empty' }
  | { kind: 'backup'; data: PersistedTasks; exportedAt: string | null; taskCount: number }
  | { kind: 'ai'; tasks: AiImportTask[]; count: number; warnings: string[] }
  | { kind: 'error'; error: string };

const BACKUP_ERRORS = {
  'invalid-json': "That backup is damaged and can't be restored.",
  'not-a-backup': "That isn't a valid backup.",
  corrupt: "That backup is damaged and can't be restored.",
} as const;

const LOOKS_LIKE_BACKUP = /"app"\s*:\s*"tasks"/;

const isApp = (v: unknown) =>
  typeof v === 'object' && v !== null && (v as Record<string, unknown>).app === 'tasks';

/**
 * Works out what pasted text is: a full app backup, an AI reply with tasks, or neither.
 * Backups win. Code fences and prose around the JSON are tolerated, as chats add them.
 */
export function detectImport(text: string): ImportDetection {
  if (text.trim() === '') return { kind: 'empty' };

  let backupError: string | null = null;
  const tryBackup = (json: string): ImportDetection | null => {
    const result = parseBackup(json);
    if (result.ok) {
      return {
        kind: 'backup',
        data: result.data,
        exportedAt: result.exportedAt,
        taskCount: result.taskCount,
      };
    }
    backupError = BACKUP_ERRORS[result.error];
    return null;
  };

  const direct = tryBackup(text.trim());
  if (direct) return direct;
  backupError = null;

  for (const candidate of jsonCandidates(text)) {
    if (candidate && isApp(candidate.value)) {
      const found = tryBackup(JSON.stringify(candidate.value));
      if (found) return found;
    }
  }

  const ai = parseAiImport(text);
  if (ai.ok) return { kind: 'ai', tasks: ai.tasks, count: ai.count, warnings: ai.warnings };

  if (backupError) return { kind: 'error', error: backupError };
  if (LOOKS_LIKE_BACKUP.test(text)) return { kind: 'error', error: BACKUP_ERRORS.corrupt };
  return { kind: 'error', error: ai.error };
}
