import { afterEach, describe, expect, it } from 'vitest';
import { capturePendingText, consumeLaunchParams, sharedText } from './newTaskShortcut';

const at = (url: string) => window.history.replaceState(null, '', url);
const here = () => window.location.pathname + window.location.search + window.location.hash;

afterEach(() => {
  at('/');
  sessionStorage.clear();
});

describe('sharedText', () => {
  const text = (query: string) => sharedText(new URLSearchParams(query));

  it('reads ?add=', () => {
    expect(text('add=Pay%20rent%20tomorrow%20%23home')).toBe('Pay rent tomorrow #home');
  });
  it('reads ?text= and ?title=', () => {
    expect(text('text=Buy%20milk')).toBe('Buy milk');
    expect(text('title=Buy%20milk')).toBe('Buy milk');
  });
  it('joins a share title and text, without repeating one inside the other', () => {
    expect(text('title=Cool%20post&text=https://a.com/p')).toBe('Cool post https://a.com/p');
    expect(text('title=Cool%20post&text=Cool%20post%20by%20Ann')).toBe('Cool post by Ann');
    expect(text('title=Same&text=Same')).toBe('Same');
  });
  it('appends ?url= unless the text already has it', () => {
    expect(text('text=Read%20this&url=https://example.com/article')).toBe(
      'Read this https://example.com/article',
    );
    expect(text('add=See%20https://a.com&url=https://a.com')).toBe('See https://a.com');
    expect(text('url=https://a.com')).toBe('https://a.com');
  });
  it('prefers add over text and title', () => {
    expect(text('add=One&text=Two&title=Three')).toBe('One');
  });
  it('collapses whitespace and caps the length', () => {
    expect(text('add=a%0A%20%20b')).toBe('a b');
    expect(text(`add=${'x'.repeat(5000)}`)).toHaveLength(1000);
  });
  it('is null without usable params', () => {
    expect(text('')).toBeNull();
    expect(text('add=%20%20&x=1')).toBeNull();
  });
});

describe('consumeLaunchParams', () => {
  it('reports and strips ?new=1, keeping other params and the hash', () => {
    at('/?new=1&x=2#h');
    expect(consumeLaunchParams()).toEqual({ newTask: true, text: null });
    expect(here()).toBe('/?x=2#h');
    expect(consumeLaunchParams()).toEqual({ newTask: false, text: null });
  });

  it('is empty without params', () => {
    at('/');
    expect(consumeLaunchParams()).toEqual({ newTask: false, text: null });
  });

  it('returns ?add= text once and strips the params', () => {
    at('/?add=Pay%20rent%20tomorrow%20%23home&x=2#h');
    expect(consumeLaunchParams()).toEqual({ newTask: false, text: 'Pay rent tomorrow #home' });
    expect(here()).toBe('/?x=2#h');
    expect(consumeLaunchParams().text).toBeNull();
  });

  it('handles the share target params', () => {
    at('/?title=Hello&text=Read%20this&url=https%3A%2F%2Fexample.com%2Fa');
    expect(consumeLaunchParams().text).toBe('Hello Read this https://example.com/a');
    expect(here()).toBe('/');
  });
});

describe('a signed-out visit', () => {
  it('keeps the text in sessionStorage, cleans the URL, and hands it over later', () => {
    at('/?add=Call%20mum&new=1');
    capturePendingText();
    expect(here()).toBe('/?new=1');
    expect(sessionStorage.getItem('tasks-pending-add')).toBe('Call mum');

    // After sign-in the composer mounts and reads it, exactly once.
    expect(consumeLaunchParams()).toEqual({ newTask: true, text: 'Call mum' });
    expect(sessionStorage.getItem('tasks-pending-add')).toBeNull();
    expect(consumeLaunchParams().text).toBeNull();
  });

  it('a later visit replaces a stale pending text', () => {
    at('/?add=First');
    capturePendingText();
    at('/?add=Second');
    capturePendingText();
    expect(consumeLaunchParams().text).toBe('Second');
  });

  it('does nothing when the URL has no text params', () => {
    at('/?new=1');
    capturePendingText();
    expect(sessionStorage.getItem('tasks-pending-add')).toBeNull();
    expect(here()).toBe('/?new=1');
  });
});
