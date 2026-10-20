import { describe, expect, it } from 'vitest';
import { mkEntry, mkState, mkTask } from '../test/factories';
import { applyRemote, buildState, emptyChanges, hasChanges } from './apply';

describe('buildState', () => {
  it('orders history by completedAt, then ordinal', () => {
    const state = buildState(
      [mkTask('a')],
      ['a'],
      [
        { entry: mkEntry('late', { completedAt: 9 }), ord: 0 },
        { entry: mkEntry('b', { completedAt: 5 }), ord: 1 },
        { entry: mkEntry('a', { completedAt: 5 }), ord: 0 },
      ],
    );
    expect(state.history.map((e) => e.id)).toEqual(['a', 'b', 'late']);
  });
});

describe('applyRemote', () => {
  const a = mkTask('a');
  const b = mkTask('b');
  const base = mkState([a, b], ['a', 'b']);

  it('does nothing when the remote value is deep-equal, keeping identities', () => {
    const changes = emptyChanges();
    changes.tasks.set('a', { ...a });
    changes.rootIds = ['a', 'b'];
    const out = applyRemote(base, base, changes);
    expect(out.changed).toBe(false);
    expect(out.next).toBe(base);
  });

  it('replaces only the tasks that differ', () => {
    const changes = emptyChanges();
    const a2 = mkTask('a', { title: 'new' });
    changes.tasks.set('a', a2);
    changes.tasks.set('b', { ...b });
    const out = applyRemote(base, base, changes);
    expect(out.changed).toBe(true);
    expect(out.next.tasks.a).toBe(a2);
    expect(out.next.tasks.b).toBe(b);
    expect(out.nextLast.tasks.a).toBe(a2);
    expect(out.next.rootIds).toBe(base.rootIds);
  });

  it('adds, removes and updates rootIds', () => {
    const c = mkTask('c');
    const changes = emptyChanges();
    changes.tasks.set('c', c);
    changes.tasks.set('b', null);
    changes.rootIds = ['c', 'a'];
    const out = applyRemote(base, base, changes);
    expect(Object.keys(out.next.tasks).sort()).toEqual(['a', 'c']);
    expect(out.next.rootIds).toEqual(['c', 'a']);
    expect(out.nextLast.rootIds).toEqual(['c', 'a']);
  });

  it('applies on top of the live state and keeps unflushed local edits', () => {
    const edited = mkTask('a', { title: 'typing' });
    const cur = { ...base, tasks: { ...base.tasks, a: edited } }; // last still has `a`
    const changes = emptyChanges();
    changes.tasks.set('a', mkTask('a', { title: 'remote' }));
    changes.tasks.set('b', mkTask('b', { title: 'remote b' }));
    const out = applyRemote(cur, base, changes);
    expect(out.next.tasks.a).toBe(edited); // local pending edit wins
    expect(out.nextLast.tasks.a).toBe(base.tasks.a); // still pending: will be diffed and written
    expect(out.next.tasks.b.title).toBe('remote b');
    expect(out.nextLast.tasks.b).toBe(out.next.tasks.b); // applied, so not echoed back
  });

  it('keeps a pending local rootIds edit', () => {
    const cur = { ...base, rootIds: ['b', 'a'] };
    const changes = emptyChanges();
    changes.rootIds = ['a'];
    const out = applyRemote(cur, base, changes);
    expect(out.next.rootIds).toEqual(['b', 'a']);
  });

  it('normalizes the result without writing the repair back', () => {
    const changes = emptyChanges();
    // remote adds a child whose parent list update has not arrived
    changes.tasks.set('k', mkTask('k', { parentId: 'a', createdAt: 4 }));
    const out = applyRemote(base, base, changes);
    expect(out.next.tasks.a.childIds).toEqual(['k']);
    expect(out.nextLast.tasks.a).toBe(out.next.tasks.a);
  });

  it('merges history by completedAt and ignores equal entries', () => {
    const h1 = mkEntry('h1', { completedAt: 1 });
    const h3 = mkEntry('h3', { completedAt: 3 });
    const state = { ...base, history: [h1, h3] };
    const changes = emptyChanges();
    const h2 = mkEntry('h2', { completedAt: 2 });
    changes.history.set('h2', { entry: h2, ord: 0 });
    changes.history.set('h1', { entry: { ...h1 }, ord: 0 });
    const out = applyRemote(state, state, changes);
    expect(out.next.history).toEqual([h1, h2, h3]);
    expect(out.next.history[0]).toBe(h1);

    const del = emptyChanges();
    del.history.set('h1', null);
    expect(applyRemote(state, state, del).next.history).toEqual([h3]);
  });

  it('leaves a locally added history entry alone', () => {
    const local = mkEntry('mine');
    const cur = { ...base, history: [local] };
    const changes = emptyChanges();
    changes.history.set('mine', null);
    expect(applyRemote(cur, base, changes).next.history).toEqual([local]);
  });
});

describe('applyRemote: tagColors', () => {
  const base = mkState([mkTask('a')], ['a'], [], { work: '#C9B8F2' });

  it('ignores a deep-equal remote map, keeping identity', () => {
    const changes = emptyChanges();
    changes.tagColors = { work: '#C9B8F2' };
    const out = applyRemote(base, base, changes);
    expect(out.changed).toBe(false);
    expect(out.next).toBe(base);
    expect(out.next.tagColors).toBe(base.tagColors);
  });

  it('applies a different remote map and does not echo it back', () => {
    const changes = emptyChanges();
    changes.tagColors = { work: '#FFD3B6', home: '#B5E5CF' };
    const out = applyRemote(base, base, changes);
    expect(out.changed).toBe(true);
    expect(out.next.tagColors).toEqual({ work: '#FFD3B6', home: '#B5E5CF' });
    expect(out.nextLast.tagColors).toBe(out.next.tagColors);
  });

  it('applies a remote removal', () => {
    const changes = emptyChanges();
    changes.tagColors = {};
    expect(applyRemote(base, base, changes).next.tagColors).toEqual({});
  });

  it('keeps a pending local edit', () => {
    const cur = { ...base, tagColors: { work: '#000000' } }; // last still has the old map
    const changes = emptyChanges();
    changes.tagColors = { work: '#FFD3B6' };
    const out = applyRemote(cur, base, changes);
    expect(out.next.tagColors).toBe(cur.tagColors);
    expect(out.nextLast.tagColors).toBe(base.tagColors);
  });

  it('is part of buildState', () => {
    expect(buildState([], [], [], { a: '#fff' }).tagColors).toEqual({ a: '#fff' });
    expect(buildState([], [], []).tagColors).toEqual({});
  });
});

describe('applyRemote settings', () => {
  const base = mkState([mkTask('a')], ['a']);
  const remote = { todayView: true, dailyCapacity: 12, hints: { todayOffered: true } };

  it('ignores deep-equal remote settings, keeping identity', () => {
    const changes = emptyChanges();
    changes.settings = { ...base.settings, hints: {} };
    const out = applyRemote(base, base, changes);
    expect(out.changed).toBe(false);
    expect(out.next).toBe(base);
    expect(out.next.settings).toBe(base.settings);
  });

  it('applies different remote settings and does not echo them back', () => {
    const changes = emptyChanges();
    changes.settings = remote;
    const out = applyRemote(base, base, changes);
    expect(out.changed).toBe(true);
    expect(out.next.settings).toEqual(remote);
    expect(out.nextLast.settings).toBe(out.next.settings);
    expect(out.next.tasks).toBe(base.tasks);
  });

  it('keeps a pending local change', () => {
    const cur = { ...base, settings: { ...base.settings, dailyCapacity: 3 } }; // not yet written
    const changes = emptyChanges();
    changes.settings = remote;
    const out = applyRemote(cur, base, changes);
    expect(out.changed).toBe(false);
    expect(out.next.settings).toBe(cur.settings);
    expect(out.nextLast.settings).toBe(base.settings);
  });

  it('is part of buildState, defaulting when absent', () => {
    expect(buildState([], [], [], {}, remote).settings).toEqual(remote);
    expect(buildState([], [], []).settings).toEqual({
      todayView: false,
      dailyCapacity: 8,
      hints: {},
    });
  });

  it('counts as a change', () => {
    const c = emptyChanges();
    c.settings = remote;
    expect(hasChanges(c)).toBe(true);
  });
});

describe('hasChanges', () => {
  it('reports empties', () => {
    expect(hasChanges(emptyChanges())).toBe(false);
    const t = emptyChanges();
    t.tagColors = {};
    expect(hasChanges(t)).toBe(true);
    const c = emptyChanges();
    c.rootIds = [];
    expect(hasChanges(c)).toBe(true);
  });
});
