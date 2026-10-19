import { migrateTasksState, type PersistedTasks } from '../store/tasks';

export type Backup = {
  app: 'tasks';
  version: 2;
  exportedAt: string;
  tasks: Record<string, unknown>;
  rootIds: unknown[];
  history: unknown[];
};

/** Serialize task data to a pretty JSON string. */
export function serializeBackup(data: PersistedTasks, now = new Date()): string {
  const backup: Backup = {
    app: 'tasks',
    version: 2,
    exportedAt: now.toISOString(),
    tasks: data.tasks,
    rootIds: data.rootIds,
    history: data.history,
  };
  return JSON.stringify(backup, null, 2);
}

/** Generate a backup filename in YYYY-MM-DD format using local date. */
export function backupFilename(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const date = String(now.getDate()).padStart(2, '0');
  return `tasks-backup-${year}-${month}-${date}.json`;
}

/** Format ISO timestamp as a locale-specific date string (e.g. "Oct 19, 2026"). */
function formatExportDate(exportedAt: string): string {
  const date = new Date(exportedAt);
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return formatter.format(date);
}

type ParseResult =
  | { ok: true; data: PersistedTasks; exportedAt: string | null; taskCount: number }
  | { ok: false; error: 'invalid-json' | 'not-a-backup' | 'corrupt' };

/** Parse and validate a backup file. Returns migrated data if successful. */
export function parseBackup(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalid-json' };
  }

  const backup = parsed as Partial<Record<keyof Backup, unknown>>;
  if (backup.app !== 'tasks' || typeof backup.tasks !== 'object' || backup.tasks === null) {
    return { ok: false, error: 'not-a-backup' };
  }

  const exportedAt = typeof backup.exportedAt === 'string' ? backup.exportedAt : null;

  // Migrate the data to ensure it has all required fields.
  let data: PersistedTasks;
  try {
    data = migrateTasksState({
      tasks: backup.tasks,
      rootIds: backup.rootIds,
      history: backup.history,
    });
  } catch {
    return { ok: false, error: 'corrupt' };
  }

  // Validate integrity: all ids must exist.
  const rootIds = new Set(data.rootIds);
  const allIds = new Set(Object.keys(data.tasks));

  for (const id of rootIds) {
    if (!allIds.has(id)) {
      return { ok: false, error: 'corrupt' };
    }
  }

  for (const task of Object.values(data.tasks)) {
    if (typeof task !== 'object' || task === null) {
      return { ok: false, error: 'corrupt' };
    }
    const t = task as Record<string, unknown>;
    for (const childId of (t.childIds as unknown[]) ?? []) {
      if (!allIds.has(childId as string)) {
        return { ok: false, error: 'corrupt' };
      }
    }
    const parentId = t.parentId as string | null;
    if (parentId !== null && !allIds.has(parentId)) {
      return { ok: false, error: 'corrupt' };
    }
  }

  return {
    ok: true,
    data,
    exportedAt,
    taskCount: Object.keys(data.tasks).length,
  };
}

/**
 * Format a backup export date and task count for display in the confirm dialog.
 * Example: "Oct 19, 2026 (5 tasks)"
 */
export function formatBackupDescription(exportedAt: string | null, taskCount: number): string {
  const countStr = `${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}`;
  if (exportedAt === null) {
    return countStr;
  }
  return `${formatExportDate(exportedAt)} (${countStr})`;
}
