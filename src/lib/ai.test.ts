import { describe, expect, it } from 'vitest';
import { mkEntry, mkState, mkTask } from '../test/factories';
import {
  appendAiTasks,
  buildExportPrompt,
  buildImportPrompt,
  importStats,
  parseAiImport,
  toAiJson,
  type AiImportTask,
} from './ai';
import { TASK_COLORS } from './colors';
import { effectiveDifficulty, emptyTree, progress } from './tree';

const NOW = new Date(2026, 9, 19, 12, 0, 0); // 2026-10-19 local
const DAY = 86_400_000;

const sample = () =>
  mkState(
    [
      mkTask('trip', {
        title: 'Plan trip',
        childIds: ['flights', 'hotel', 'visa'],
        tags: ['travel'],
      }),
      mkTask('flights', {
        title: 'Book flights',
        parentId: 'trip',
        difficulty: 3,
        dueDate: '2026-10-18',
      }),
      mkTask('hotel', {
        title: 'Reserve hotel',
        parentId: 'trip',
        difficulty: 2,
        done: true,
        completedAt: NOW.getTime() - DAY,
      }),
      mkTask('visa', { title: 'Visa', parentId: 'trip', difficulty: 4, dueDate: '2026-10-19' }),
      mkTask('solo', { title: 'Call mom', difficulty: 1, dueDate: '2026-10-21' }),
      mkTask('old', {
        title: 'Old thing',
        difficulty: 2,
        done: true,
        completedAt: NOW.getTime() - 30 * DAY,
      }),
    ],
    ['trip', 'solo', 'old'],
    [
      mkEntry('h1', {
        title: 'Reserve hotel',
        completedAt: NOW.getTime() - DAY,
        path: ['Plan trip'],
      }),
      mkEntry('h2', { title: 'Old thing', completedAt: NOW.getTime() - 30 * DAY }),
      mkEntry('h3', { title: 'Auto parent', completedAt: NOW.getTime() - DAY, auto: true }),
    ],
  );

describe('toAiJson', () => {
  it('builds a nested, id-free tree with sums, progress and due status', () => {
    const out = toAiJson(sample(), { includeCompleted: true, now: NOW });
    expect(out.app).toBe('tasks');
    expect(out.format).toBe('tasks-ai-v1');
    expect(out.today).toBe('2026-10-19');
    // Undone before done, tree order kept inside each group.
    expect(out.tasks.map((t) => t.title)).toEqual(['Plan trip', 'Call mom', 'Old thing']);
    const trip = out.tasks[0];
    expect(trip.difficulty).toBe(9);
    expect(trip.progress).toBe('1/3');
    expect(trip.tags).toEqual(['travel']);
    expect(trip.subtasks?.map((t) => [t.title, t.dueStatus])).toEqual([
      ['Book flights', 'overdue'],
      ['Visa', 'today'],
      ['Reserve hotel', undefined],
    ]);
    expect(trip.subtasks?.[2].completedAt).toBe('2026-10-18');
    expect(out.tasks[1].dueStatus).toBe('soon');
  });

  it('omits empty fields and internal data', () => {
    const out = toAiJson(sample(), { includeCompleted: false, now: NOW });
    const solo = out.tasks.find((t) => t.title === 'Call mom')!;
    expect(Object.keys(solo).sort()).toEqual(
      ['difficulty', 'done', 'dueStatus', 'due', 'title'].sort(),
    );
    const text = JSON.stringify(out);
    for (const banned of ['"id"', 'color', 'collapsed', 'childIds', 'parentId', '#A9C6F5']) {
      expect(text).not.toContain(banned);
    }
    expect(
      JSON.stringify(toAiJson(mkState([]), { includeCompleted: true, now: NOW })),
    ).not.toContain('recentlyCompleted');
  });

  it('leaves out completed tasks unless asked', () => {
    const out = toAiJson(sample(), { includeCompleted: false, now: NOW });
    expect(out.tasks.map((t) => t.title)).toEqual(['Plan trip', 'Call mom']);
    expect(out.tasks[0].subtasks?.map((t) => t.title)).toEqual(['Book flights', 'Visa']);
  });

  it('summarises leaves like the header and counts deadlines', () => {
    const out = toAiJson(sample(), { includeCompleted: false, now: NOW });
    expect(out.summary).toEqual({ open: 3, done: 2, openDifficulty: 8, overdue: 1, dueToday: 1 });
  });

  it('lists the last week of completions, newest first, skipping cascades', () => {
    const out = toAiJson(sample(), { includeCompleted: false, now: NOW });
    expect(out.recentlyCompleted).toEqual([
      { title: 'Reserve hotel', completedAt: '2026-10-18', path: 'Plan trip' },
    ]);
  });

  it('caps recent completions at 30', () => {
    const history = Array.from({ length: 40 }, (_, i) =>
      mkEntry(`e${i}`, { completedAt: NOW.getTime() - i * 1000 }),
    );
    const out = toAiJson(mkState([], [], history), { includeCompleted: false, now: NOW });
    expect(out.recentlyCompleted).toHaveLength(30);
    expect(out.recentlyCompleted?.[0].title).toBe('e0');
  });
});

describe('buildExportPrompt', () => {
  it('wraps the JSON in a fence between a preamble and an open question', () => {
    const prompt = buildExportPrompt(toAiJson(sample(), { includeCompleted: false, now: NOW }));
    expect(prompt).toContain('Today is 2026-10-19.');
    expect(prompt).toContain('```json\n{');
    expect(prompt).toContain('Plan trip');
    expect(prompt.endsWith('Based on this, help me with: \n\n')).toBe(true);
    const json = /```json\n([\s\S]*?)\n```/.exec(prompt)![1];
    expect(JSON.parse(json).tasks[0].title).toBe('Plan trip');
  });
});

describe('buildImportPrompt', () => {
  it('states the schema, the rules, the goal and today', () => {
    const prompt = buildImportPrompt('Launch my site by Nov 15', { now: NOW });
    expect(prompt).toContain('"format": "tasks-ai-v1"');
    expect(prompt).toContain('"subtasks"');
    expect(prompt).toContain('at most 80 characters');
    expect(prompt).toContain('2026-10-19');
    expect(prompt).toContain('My goal: Launch my site by Nov 15');
    expect(prompt).toContain('no code fences');
    expect(prompt).not.toContain("don't repeat");
  });

  it('uses a placeholder for an empty goal and embeds the context when given', () => {
    const context = toAiJson(sample(), { includeCompleted: false, now: NOW });
    const prompt = buildImportPrompt('  ', { context });
    expect(prompt).toContain('My goal: [describe what you want to plan here]');
    expect(prompt).toContain("don't repeat tasks already on it");
    expect(prompt).toContain('Call mom');
    expect(prompt).toContain('2026-10-19');
  });
});

describe('parseAiImport', () => {
  const reply = (obj: unknown) => JSON.stringify(obj);

  it('reads a fenced reply with prose around it', () => {
    const text = `Sure! Here's your plan:\n\n\`\`\`json\n${reply({
      format: 'tasks-ai-v1',
      tasks: [
        { title: 'Design', difficulty: 2, subtasks: [{ title: 'Wireframes', difficulty: 3 }] },
      ],
    })}\n\`\`\`\n\nLet me know if you want changes. {not json}`;
    const out = parseAiImport(text);
    expect(out).toMatchObject({ ok: true, count: 2, warnings: [] });
    if (!out.ok) return;
    expect(out.tasks[0].subtasks[0]).toMatchObject({ title: 'Wireframes', difficulty: 3 });
  });

  it('accepts a bare array and skips unrelated brackets in the prose', () => {
    const out = parseAiImport(`Steps [1] and [2]:\n${reply([{ title: 'A' }, 'B'])}`);
    expect(out).toMatchObject({ ok: true, count: 2 });
    if (out.ok) expect(out.tasks.map((t) => t.title)).toEqual(['A', 'B']);
  });

  it('accepts aliases', () => {
    const out = parseAiImport(
      reply({
        items: [
          {
            name: 'Parent',
            deadline: '2026-11-15',
            children: [{ task: 'Child', dueDate: '2026-12-01', items: [{ title: 'Grandchild' }] }],
          },
        ],
      }),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.count).toBe(3);
    expect(out.tasks[0].due).toBe('2026-11-15');
    expect(out.tasks[0].subtasks[0].due).toBe('2026-12-01');
    expect(out.tasks[0].subtasks[0].subtasks[0].title).toBe('Grandchild');
  });

  it('respects braces inside strings and tolerates trailing commas', () => {
    const out = parseAiImport('{"tasks":[{"title":"Fix } and { in titles",},]}');
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.tasks[0].title).toBe('Fix } and { in titles');
  });

  it('clamps and maps difficulty', () => {
    const out = parseAiImport(
      reply([
        { title: 'a', difficulty: 9 },
        { title: 'b', difficulty: 0 },
        { title: 'c', difficulty: 2.6 },
        { title: 'd', difficulty: 'hard' },
        { title: 'e', difficulty: 'Medium' },
        { title: 'f', difficulty: 'easy' },
        { title: 'g', difficulty: '4' },
        { title: 'h' },
      ]),
    );
    expect(out.ok && out.tasks.map((t) => t.difficulty)).toEqual([5, 1, 3, 4, 3, 1, 4, 1]);
  });

  it('normalizes tags, including a comma string', () => {
    const out = parseAiImport(
      reply([
        { title: 'a', tags: ['#Work', 'work', ' Home '] },
        { title: 'b', tags: 'Errands, #Quick' },
      ]),
    );
    expect(out.ok && out.tasks.map((t) => t.tags)).toEqual([
      ['work', 'home'],
      ['errands', 'quick'],
    ]);
  });

  it('drops invalid dates with a warning and keeps done flags', () => {
    const out = parseAiImport(
      reply([
        { title: 'Book flights', due: '2026-02-31' },
        { title: 'Tomorrow', due: 'tomorrow' },
        { title: 'Fine', due: '2026-02-28', done: true },
      ]),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.tasks.map((t) => t.due)).toEqual([undefined, undefined, '2026-02-28']);
    expect(out.tasks[2].done).toBe(true);
    expect(out.warnings).toContain('Removed an invalid date on “Book flights”');
    expect(out.warnings).toContain('Removed an invalid date on “Tomorrow”');
  });

  it('drops untitled items and clamps long titles', () => {
    const out = parseAiImport(
      reply([{ title: '  ' }, { difficulty: 2 }, 42, { title: 'x'.repeat(900) }]),
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.tasks).toHaveLength(1);
    expect(out.tasks[0].title).toHaveLength(500);
    expect(out.warnings).toEqual(['Ignored 3 items without a title']);
  });

  it('caps depth at 5', () => {
    let deep: unknown = { title: 'L6' };
    for (let i = 5; i >= 1; i--) deep = { title: `L${i}`, subtasks: [deep] };
    const out = parseAiImport(reply([deep]));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.count).toBe(5);
    expect(out.warnings[0]).toMatch(/deeper than 5 levels/);
  });

  it('caps the total at 300', () => {
    const out = parseAiImport(reply(Array.from({ length: 320 }, (_, i) => ({ title: `T${i}` }))));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.count).toBe(300);
    expect(out.warnings[0]).toMatch(/first 300 tasks/);
  });

  it('explains garbage', () => {
    expect(parseAiImport('hello there')).toEqual({
      ok: false,
      error: "Couldn't find any JSON in that text. Paste the AI's full reply.",
    });
    expect(parseAiImport('{"tasks": [{"title": "A"')).toEqual({
      ok: false,
      error: 'That JSON is malformed — try asking the AI to output only valid JSON.',
    });
    expect(parseAiImport('{"tasks": []}')).toEqual({
      ok: false,
      error: 'No tasks found in that reply.',
    });
    expect(parseAiImport('{"foo": 1}')).toMatchObject({ ok: false });
  });

  it('round-trips an export through the import parser', () => {
    const exported = toAiJson(sample(), { includeCompleted: false, now: NOW });
    const out = parseAiImport(buildExportPrompt(exported));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.tasks.map((t) => t.title)).toEqual(['Plan trip', 'Call mom']);
    const trip = out.tasks[0];
    expect(trip.subtasks.map((t) => [t.title, t.difficulty, t.due])).toEqual([
      ['Book flights', 3, '2026-10-18'],
      ['Visa', 4, '2026-10-19'],
    ]);
    expect(trip.tags).toEqual(['travel']);
    expect(importStats(out.tasks)).toEqual({ count: 4, difficulty: 3 + 4 + 1 });
  });
});

describe('appendAiTasks', () => {
  const tasks: AiImportTask[] = [
    {
      title: 'Project A',
      difficulty: 1,
      tags: ['work'],
      due: '2026-11-15',
      subtasks: [
        { title: 'A1', difficulty: 2, tags: [], subtasks: [] },
        { title: 'A2', difficulty: 4, tags: ['x'], subtasks: [] },
      ],
    },
    { title: 'Project B', difficulty: 3, tags: [], subtasks: [] },
  ];

  it('builds structure in order with summed difficulty and distinct root colours', () => {
    const out = appendAiTasks(emptyTree(), tasks, { now: 100 });
    expect(out.count).toBe(4);
    expect(out.ids).toHaveLength(2);
    expect(out.tree.rootIds).toEqual(out.ids);
    const [a, b] = out.ids.map((id) => out.tree.tasks[id]);
    expect([a.title, b.title]).toEqual(['Project A', 'Project B']);
    expect(a.dueDate).toBe('2026-11-15');
    expect(a.tags).toEqual(['work']);
    expect(a.childIds.map((id) => out.tree.tasks[id].title)).toEqual(['A1', 'A2']);
    expect(effectiveDifficulty(out.tree, a.id)).toBe(6);
    expect(a.color).toBe(TASK_COLORS[0].hex);
    expect(b.color).toBe(TASK_COLORS[1].hex);
    expect(out.tree.tasks[a.childIds[0]].color).toBe(a.color);
    expect(a.createdAt).toBe(100);
  });

  it('appends after existing roots, keeps untouched tasks shared, and continues the colours', () => {
    const base = appendAiTasks(emptyTree(), [tasks[1]]).tree;
    const out = appendAiTasks(base, tasks);
    expect(out.tree.rootIds.slice(0, 1)).toEqual(base.rootIds);
    expect(out.tree.tasks[base.rootIds[0]]).toBe(base.tasks[base.rootIds[0]]);
    expect(out.tree.tasks[out.ids[0]].color).toBe(TASK_COLORS[1].hex);
  });

  it('nests under a parent and inherits its colour; unknown parents are a no-op', () => {
    const base = appendAiTasks(emptyTree(), [tasks[1]]).tree;
    const parentId = base.rootIds[0];
    const out = appendAiTasks(base, [tasks[0].subtasks[0]], { parentId });
    expect(out.tree.tasks[parentId].childIds).toEqual(out.ids);
    expect(out.tree.tasks[out.ids[0]].color).toBe(base.tasks[parentId].color);
    expect(appendAiTasks(base, tasks, { parentId: 'nope' })).toEqual({
      tree: base,
      ids: [],
      count: 0,
    });
  });

  it('uses a given colour for every new root', () => {
    const out = appendAiTasks(emptyTree(), tasks, { color: '#123456' });
    expect(out.ids.every((id) => out.tree.tasks[id].color === '#123456')).toBe(true);
  });

  it('marks done leaves and derives parent done state', () => {
    const done: AiImportTask[] = [
      {
        title: 'P',
        difficulty: 1,
        tags: [],
        subtasks: [
          { title: 'c1', difficulty: 1, tags: [], done: true, subtasks: [] },
          { title: 'c2', difficulty: 1, tags: [], done: true, subtasks: [] },
        ],
      },
      {
        title: 'Q',
        difficulty: 1,
        tags: [],
        subtasks: [
          { title: 'd1', difficulty: 1, tags: [], done: true, subtasks: [] },
          { title: 'd2', difficulty: 1, tags: [], subtasks: [] },
        ],
      },
    ];
    const out = appendAiTasks(emptyTree(), done, { now: 50 });
    const [p, q] = out.ids.map((id) => out.tree.tasks[id]);
    expect(p.done).toBe(true);
    expect(p.completedAt).toBe(50);
    expect(q.done).toBe(false);
    expect(progress(out.tree, q.id)).toEqual({ done: 1, total: 2 });
  });
});
