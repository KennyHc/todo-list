import { MAX_TITLE_LENGTH, type Difficulty, type Task, type TaskTree } from '../types';
import type { PersistedTasks } from '../store/tasks';
import { TASK_COLORS } from './colors';
import { normalizeTags } from './tags';
import { addTask, effectiveDifficulty, progress, sortedChildIds, toggleDone } from './tree';
import { dueStatus, todayISO } from './views';

// ---------------------------------------------------------------------------
// Export: the list as compact, id-free JSON for a chatbot
// ---------------------------------------------------------------------------

export type AiTask = {
  title: string;
  done: boolean;
  /** Leaf: its own; parent: the sum over its subtasks. */
  difficulty: number;
  /** Parents only, e.g. "2/5" (done/total leaf subtasks). */
  progress?: string;
  tags?: string[];
  due?: string;
  dueStatus?: 'overdue' | 'today' | 'soon';
  completedAt?: string;
  subtasks?: AiTask[];
};

export type AiExport = {
  app: 'tasks';
  format: 'tasks-ai-v1';
  exportedAt: string;
  today: string;
  summary: {
    open: number;
    done: number;
    openDifficulty: number;
    overdue: number;
    dueToday: number;
  };
  tasks: AiTask[];
  recentlyCompleted?: { title: string; completedAt: string; path?: string }[];
};

export const AI_FORMAT = 'tasks-ai-v1';
const RECENT_DAYS = 7;
const RECENT_MAX = 30;

export function toAiJson(
  state: PersistedTasks,
  opts: { includeCompleted: boolean; now?: Date },
): AiExport {
  const now = opts.now ?? new Date();
  const today = todayISO(now);
  const tree: TaskTree = { tasks: state.tasks, rootIds: state.rootIds };

  const build = (task: Task): AiTask => {
    const out: AiTask = {
      title: task.title,
      done: task.done,
      difficulty: effectiveDifficulty(tree, task.id),
    };
    if (task.childIds.length > 0) {
      const p = progress(tree, task.id);
      out.progress = `${p.done}/${p.total}`;
    }
    if (task.tags.length > 0) out.tags = task.tags;
    if (task.dueDate !== null) {
      out.due = task.dueDate;
      const status = task.done ? null : dueStatus(task.dueDate, today);
      if (status !== null && status !== 'later') out.dueStatus = status;
    }
    if (task.done && task.completedAt !== undefined) {
      out.completedAt = todayISO(new Date(task.completedAt));
    }
    const subtasks = list(task.childIds);
    if (subtasks.length > 0) out.subtasks = subtasks;
    return out;
  };
  const list = (ids: string[]): AiTask[] =>
    sortedChildIds(tree, ids)
      .map((id) => tree.tasks[id])
      .filter((task): task is Task => task !== undefined && (opts.includeCompleted || !task.done))
      .map(build);

  // Header semantics: leaves are what count; deadlines belong to whichever task carries them.
  let open = 0;
  let done = 0;
  let openDifficulty = 0;
  let overdue = 0;
  let dueToday = 0;
  for (const task of Object.values(tree.tasks)) {
    if (task.childIds.length === 0) {
      if (task.done) done += 1;
      else {
        open += 1;
        openDifficulty += task.difficulty;
      }
    }
    if (!task.done) {
      const status = dueStatus(task.dueDate, today);
      if (status === 'overdue') overdue += 1;
      else if (status === 'today') dueToday += 1;
    }
  }

  const result: AiExport = {
    app: 'tasks',
    format: AI_FORMAT,
    exportedAt: now.toISOString(),
    today,
    summary: { open, done, openDifficulty, overdue, dueToday },
    tasks: list(tree.rootIds),
  };

  // Only what the user finished themselves; cascaded parents would just repeat their subtasks.
  const since = now.getTime() - RECENT_DAYS * 86_400_000;
  const recent = state.history
    .filter(
      (entry) => !entry.auto && entry.completedAt >= since && entry.completedAt <= now.getTime(),
    )
    .sort((a, b) => b.completedAt - a.completedAt)
    .slice(0, RECENT_MAX)
    .map((entry) => ({
      title: entry.title,
      completedAt: todayISO(new Date(entry.completedAt)),
      ...(entry.path.length > 0 ? { path: entry.path.join(' › ') } : {}),
    }));
  if (recent.length > 0) result.recentlyCompleted = recent;
  return result;
}

export function buildExportPrompt(exportJson: AiExport): string {
  return [
    'Here is my current todo list from my Tasks app, as JSON. `difficulty` is 1–5 per task (parents show the sum of their subtasks), `progress` is done/total subtasks. Today is ' +
      exportJson.today +
      '.',
    '',
    '```json',
    JSON.stringify(exportJson, null, 1),
    '```',
    '',
    'Based on this, help me with: ',
    '',
    '',
  ].join('\n');
}

/** Rough token estimate (about four characters per token). */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

// ---------------------------------------------------------------------------
// Import: the prompt that makes a chatbot answer in our format
// ---------------------------------------------------------------------------

export const GOAL_PLACEHOLDER = '[describe what you want to plan here]';

export function buildImportPrompt(
  goal: string,
  opts: { context?: AiExport; now?: Date } = {},
): string {
  const today = opts.context?.today ?? todayISO(opts.now ?? new Date());
  const lines = [
    'Help me plan a list of tasks for my Tasks app. Reply with ONLY a JSON object in exactly this format:',
    '',
    '{ "format": "tasks-ai-v1", "tasks": [ { "title": "…", "difficulty": 1-5, "tags": ["…"], "due": "YYYY-MM-DD", "subtasks": [ … ] } ] }',
    '',
    'Rules:',
    '- "title": short and actionable, at most 80 characters.',
    '- "difficulty": an integer 1-5 for leaf tasks (estimated effort). Ignored on tasks that have subtasks.',
    '- Anything that would be a 5 should be broken into "subtasks".',
    '- At most 3 levels deep.',
    '- "tags": optional, lowercase, without "#".',
    `- "due": optional YYYY-MM-DD, only if implied by my goal, relative to today (${today}).`,
    '- Leave out optional keys you do not need. No other keys, no prose, no code fences.',
    '',
    'Example:',
    '{ "format": "tasks-ai-v1", "tasks": [ { "title": "Plan the trip", "tags": ["travel"], "subtasks": [ { "title": "Book flights", "difficulty": 2, "due": "2026-11-01" }, { "title": "Reserve a hotel", "difficulty": 1 } ] } ] }',
    '',
  ];
  if (opts.context) {
    lines.push(
      "Here is my existing list for context; don't repeat tasks already on it:",
      '```json',
      JSON.stringify(opts.context, null, 1),
      '```',
      '',
    );
  }
  lines.push(`My goal: ${goal.trim() || GOAL_PLACEHOLDER}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Import: forgiving parser
// ---------------------------------------------------------------------------

export type AiImportTask = {
  title: string;
  /** 1-5; only meaningful for leaves. */
  difficulty: Difficulty;
  tags: string[];
  due?: string;
  done?: boolean;
  subtasks: AiImportTask[];
};

export type AiParseResult =
  | { ok: true; tasks: AiImportTask[]; count: number; warnings: string[] }
  | { ok: false; error: string };

export const MAX_IMPORT_DEPTH = 5;
export const MAX_IMPORT_TASKS = 300;

const ERR_NO_JSON = "Couldn't find any JSON in that text. Paste the AI's full reply.";
const ERR_MALFORMED = 'That JSON is malformed — try asking the AI to output only valid JSON.';
const ERR_EMPTY = 'No tasks found in that reply.';

/** Index just past the bracket that closes the one at `start`, or -1. Respects strings. */
function scanBalanced(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i += 1;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{' || c === '[') depth += 1;
    else if (c === '}' || c === ']') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function tryParse(json: string): { value: unknown } | null {
  for (const candidate of [json, json.replace(/,(\s*[}\]])/g, '$1')]) {
    try {
      return { value: JSON.parse(candidate) };
    } catch {
      /* try the next repair */
    }
  }
  return null;
}

const MAX_CANDIDATES = 20;

/** Every top-level JSON object/array in `text` (code fences and prose around them are skipped). */
function* jsonCandidates(text: string): Generator<{ value: unknown } | null> {
  let attempts = 0;
  let i = 0;
  while (attempts < MAX_CANDIDATES) {
    const start = text.slice(i).search(/[{[]/);
    if (start === -1) return;
    const from = i + start;
    attempts += 1;
    const end = scanBalanced(text, from);
    const parsed = end === -1 ? null : tryParse(text.slice(from, end));
    yield parsed;
    i = parsed !== null ? end : from + 1;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const pick = (obj: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  return undefined;
};

const LEVELS: [RegExp, Difficulty][] = [
  [/^(trivial|easy|low|small|simple)$/, 1],
  [/^(medium|med|moderate|normal)$/, 3],
  [/^(hard|high|difficult|large|big)$/, 4],
];

function parseDifficulty(raw: unknown): Difficulty {
  let n = NaN;
  if (typeof raw === 'number') n = raw;
  else if (typeof raw === 'string') {
    const text = raw.trim().toLowerCase();
    n = Number(text);
    if (Number.isNaN(n)) {
      const level = LEVELS.find(([re]) => re.test(text));
      if (level) return level[1];
    }
  }
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, Math.round(n))) as Difficulty;
}

function validDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  const real =
    date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
  return real ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function parseTags(raw: unknown): string[] {
  if (typeof raw === 'string') return normalizeTags(raw.split(','));
  if (Array.isArray(raw))
    return normalizeTags(raw.filter((t): t is string => typeof t === 'string'));
  return [];
}

const SUBTASK_KEYS = ['subtasks', 'children', 'items', 'subTasks', 'sub_tasks'];
const TITLE_KEYS = ['title', 'name', 'task'];
const DUE_KEYS = ['due', 'deadline', 'dueDate', 'due_date'];

export function parseAiImport(text: string): AiParseResult {
  let sawCandidate = false;
  let sawParsed = false;
  let found: { tasks: AiImportTask[]; count: number; warnings: string[] } | null = null;

  for (const parsed of jsonCandidates(text)) {
    sawCandidate = true;
    if (parsed === null) continue;
    sawParsed = true;
    const result = normalize(parsed.value);
    if (result.count > 0) {
      found = result;
      break;
    }
  }

  if (found) return { ok: true, ...found };
  if (!sawCandidate) return { ok: false, error: ERR_NO_JSON };
  return { ok: false, error: sawParsed ? ERR_EMPTY : ERR_MALFORMED };
}

function normalize(root: unknown): { tasks: AiImportTask[]; count: number; warnings: string[] } {
  let rawList: unknown[] = [];
  if (Array.isArray(root)) rawList = root;
  else if (isRecord(root)) {
    const list = pick(root, ['tasks', 'items', 'todos', 'subtasks', 'children']);
    if (Array.isArray(list)) rawList = list;
    else if (pick(root, TITLE_KEYS) !== undefined) rawList = [root];
  }

  let untitled = 0;
  let count = 0;
  let cappedCount = 0;
  let tooDeep = 0;
  const badDates: string[] = [];

  const visit = (raw: unknown, depth: number): AiImportTask | null => {
    let obj: Record<string, unknown>;
    if (typeof raw === 'string') obj = { title: raw };
    else if (isRecord(raw)) obj = raw;
    else {
      untitled += 1;
      return null;
    }
    const rawTitle = pick(obj, TITLE_KEYS);
    const title = typeof rawTitle === 'string' ? rawTitle.replace(/\s+/g, ' ').trim() : '';
    if (title === '') {
      untitled += 1;
      return null;
    }
    if (depth > MAX_IMPORT_DEPTH) {
      tooDeep += 1;
      return null;
    }
    if (count >= MAX_IMPORT_TASKS) {
      cappedCount += 1;
      return null;
    }
    count += 1;

    const task: AiImportTask = {
      title: title.slice(0, MAX_TITLE_LENGTH),
      difficulty: parseDifficulty(obj.difficulty),
      tags: parseTags(obj.tags),
      subtasks: [],
    };
    const rawDue = pick(obj, DUE_KEYS);
    if (rawDue !== undefined && rawDue !== '') {
      const due = validDate(rawDue);
      if (due) task.due = due;
      else badDates.push(task.title);
    }
    if (obj.done === true) task.done = true;

    const rawSubs = pick(obj, SUBTASK_KEYS);
    if (Array.isArray(rawSubs)) {
      for (const sub of rawSubs) {
        const child = visit(sub, depth + 1);
        if (child) task.subtasks.push(child);
      }
    }
    return task;
  };

  const tasks: AiImportTask[] = [];
  for (const raw of rawList) {
    const task = visit(raw, 1);
    if (task) tasks.push(task);
  }

  const warnings: string[] = [];
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  if (untitled > 0) warnings.push(`Ignored ${n(untitled, 'item', 'items')} without a title`);
  for (const title of badDates.slice(0, 3)) {
    warnings.push(`Removed an invalid date on “${title}”`);
  }
  if (badDates.length > 3) warnings.push(`Removed ${badDates.length - 3} more invalid dates`);
  if (tooDeep > 0) {
    warnings.push(
      `Skipped ${n(tooDeep, 'item', 'items')} nested deeper than ${MAX_IMPORT_DEPTH} levels`,
    );
  }
  if (cappedCount > 0) {
    warnings.push(
      `Only the first ${MAX_IMPORT_TASKS} tasks were kept; ${cappedCount} more were skipped`,
    );
  }
  return { tasks, count, warnings };
}

/** Totals for the preview: tasks and the summed difficulty of the leaves. */
export function importStats(tasks: AiImportTask[]): { count: number; difficulty: number } {
  let count = 0;
  let difficulty = 0;
  const walk = (list: AiImportTask[]) => {
    for (const task of list) {
      count += 1;
      if (task.subtasks.length === 0) difficulty += task.difficulty;
      else walk(task.subtasks);
    }
  };
  walk(tasks);
  return { count, difficulty };
}

// ---------------------------------------------------------------------------
// Import: apply to a tree
// ---------------------------------------------------------------------------

/**
 * Appends the imported tasks (in order, recursively) at the root or under `parentId`. Each new
 * root gets the next palette colour; subtasks inherit it. Done leaves are marked afterwards via
 * toggleDone, so parents derive their done state like they do everywhere else.
 */
export function appendAiTasks(
  tree: TaskTree,
  tasks: AiImportTask[],
  opts: { parentId?: string | null; color?: string; now?: number } = {},
): { tree: TaskTree; ids: string[]; count: number } {
  const parentId = opts.parentId ?? null;
  const now = opts.now ?? Date.now();
  if (parentId !== null && !tree.tasks[parentId]) return { tree, ids: [], count: 0 };

  let current = tree;
  let count = 0;
  const ids: string[] = [];
  const doneLeaves: string[] = [];

  const add = (task: AiImportTask, parent: string | null, color: string | undefined): string => {
    const result = addTask(
      current,
      {
        title: task.title,
        parentId: parent,
        difficulty: task.difficulty,
        color,
        tags: task.tags,
        dueDate: task.due ?? null,
      },
      now,
    );
    current = result.tree;
    count += 1;
    if (task.subtasks.length === 0) {
      if (task.done) doneLeaves.push(result.id);
    } else {
      for (const sub of task.subtasks) add(sub, result.id, undefined);
    }
    return result.id;
  };

  const base = tree.rootIds.length;
  tasks.forEach((task, i) => {
    const color =
      opts.color ??
      (parentId === null ? TASK_COLORS[(base + i) % TASK_COLORS.length].hex : undefined);
    ids.push(add(task, parentId, color));
  });

  for (const id of doneLeaves) current = toggleDone(current, id, now);
  return { tree: current, ids, count };
}
