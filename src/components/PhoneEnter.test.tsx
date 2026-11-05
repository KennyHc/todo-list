import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { resetTaskStore, useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';
import { TagEditor } from './TagEditor';
import { TaskInput } from './TaskInput';

/** `touch`: a phone (no hover, coarse pointer); otherwise a desktop. Wide screen either way. */
function mockMedia(touch: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: touch && query === '(hover: none) and (pointer: coarse)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  })) as never;
}

beforeEach(() => {
  localStorage.clear();
  resetTaskStore();
  useUIStore.setState({ view: 'tree', tagFilter: null, focusedId: null });
});

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

const tasks = () => Object.values(useTaskStore.getState().tasks);
const titles = () => tasks().map((t) => t.title);
const editor = () => screen.getByLabelText('Task title') as HTMLInputElement;
/** Lets the deferred Enter (scheduled on compositionend) run. */
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

/**
 * What Gboard does when ✓ is tapped on an underlined word: the keydown arrives while composing,
 * then the IME commits the word and ends the composition.
 */
async function composeThenEnter(input: HTMLElement, before: string, word: string) {
  fireEvent.change(input, { target: { value: before } });
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: before + word.slice(0, -1) } });
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  fireEvent.change(input, { target: { value: before + word } });
  fireEvent.compositionEnd(input);
  await flush();
}

/** Starts editing a fresh sibling of "First", the way the row "+" or Enter does. */
function editNewRow() {
  render(<App />);
  let first = '';
  act(() => {
    const { add, setEditingId } = useTaskStore.getState();
    first = add({ title: 'First' });
    setEditingId(add({ title: '', afterId: first, parentId: null }));
  });
  return first;
}

describe('phone action key in the title editor', () => {
  beforeEach(() => mockMedia(true));

  it('saves and opens a new sibling below, focused, like desktop Enter', () => {
    editNewRow();
    fireEvent.change(editor(), { target: { value: 'Second' } });
    fireEvent.keyDown(editor(), { key: 'Enter' });

    const { tasks: all, rootIds, editingId } = useTaskStore.getState();
    expect(rootIds.map((id) => all[id].title)).toEqual(['First', 'Second', '']);
    expect(editingId).toBe(rootIds[2]);
    expect(editor()).toHaveValue('');
    expect(editor()).toHaveFocus();
    expect(editor()).toHaveAttribute('enterkeyhint', 'next');
  });

  it('Enter on an empty row still finishes', () => {
    editNewRow();
    fireEvent.keyDown(editor(), { key: 'Enter' });
    expect(titles()).toEqual(['First']);
    expect(useTaskStore.getState().editingId).toBeNull();
  });

  it('acts on ✓ tapped mid-word, once, with the whole word', async () => {
    editNewRow();
    await composeThenEnter(editor(), 'Buy ', 'milk');
    expect(titles()).toEqual(['First', 'Buy milk', '']);
    expect(editor()).toHaveFocus();

    // Some keyboards also send a plain Enter right after: it is the same key press.
    fireEvent.keyDown(editor(), { key: 'Enter' });
    expect(titles()).toEqual(['First', 'Buy milk', '']);
  });

  it('a real Enter that beats the deferred one runs only once', async () => {
    editNewRow();
    fireEvent.compositionStart(editor());
    fireEvent.change(editor(), { target: { value: 'Tea' } });
    fireEvent.keyDown(editor(), { key: 'Enter', isComposing: true });
    fireEvent.compositionEnd(editor());
    fireEvent.keyDown(editor(), { key: 'Enter' });
    await flush();
    expect(titles()).toEqual(['First', 'Tea', '']);
  });
});

describe('Enter while composing on desktop', () => {
  beforeEach(() => mockMedia(false));

  it('only commits the word (IME convention), then a second Enter saves', async () => {
    editNewRow();
    await composeThenEnter(editor(), '', 'Sushi');
    expect(titles()).toEqual(['First', '']);
    expect(editor()).toHaveValue('Sushi');

    // Past the 150 ms echo window left by the phone tests above.
    await act(() => new Promise((r) => setTimeout(r, 200)));
    fireEvent.keyDown(editor(), { key: 'Enter' });
    expect(titles()).toEqual(['First', 'Sushi', '']);
  });
});

describe('phone action key in the composer and tag editor', () => {
  beforeEach(() => mockMedia(true));

  it('the composer adds the task with the last word, once', async () => {
    render(<TaskInput />);
    const input = screen.getByLabelText('New task');
    expect(input).toHaveAttribute('enterkeyhint', 'enter');
    await composeThenEnter(input, 'Call ', 'mum');
    expect(titles()).toEqual(['Call mum']);
    expect(input).toHaveValue('');
  });

  it('the tag editor adds the tag with the last word', async () => {
    function Harness() {
      const [tags, setTags] = useState<string[]>([]);
      return <TagEditor tags={tags} onChange={setTags} />;
    }
    render(<Harness />);
    const input = screen.getByLabelText('Add tag');
    await composeThenEnter(input, '', 'errands');
    expect(screen.getByRole('list', { name: 'Tags' })).toHaveTextContent('errands');
    expect(input).toHaveValue('');
  });
});
