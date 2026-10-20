import { afterEach, describe, expect, it } from 'vitest';
import { consumeNewTaskParam } from './newTaskShortcut';

afterEach(() => window.history.replaceState(null, '', '/'));

describe('consumeNewTaskParam', () => {
  it('reports and strips ?new=1, keeping other params and the hash', () => {
    window.history.replaceState(null, '', '/?new=1&x=2#h');
    expect(consumeNewTaskParam()).toBe(true);
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      '/?x=2#h',
    );
    expect(consumeNewTaskParam()).toBe(false);
  });

  it('is false without the param', () => {
    window.history.replaceState(null, '', '/');
    expect(consumeNewTaskParam()).toBe(false);
  });
});
