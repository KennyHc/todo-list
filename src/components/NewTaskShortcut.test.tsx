import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { resetTaskStore, useTaskStore } from '../store/tasks';
import { TaskInput } from './TaskInput';

afterEach(() => {
  window.history.replaceState(null, '', '/');
  sessionStorage.clear();
});

describe('?new=1 manifest shortcut', () => {
  it('focuses the composer and strips the param', () => {
    resetTaskStore();
    window.history.replaceState(null, '', '/?new=1');
    render(<TaskInput />);
    expect(screen.getByLabelText('New task')).toHaveFocus();
    expect(window.location.search).toBe('');
  });

  it('leaves focus alone without the param', () => {
    render(<TaskInput />);
    expect(screen.getByLabelText('New task')).not.toHaveFocus();
  });
});

describe('?add= and the share target', () => {
  it('prefills and focuses the composer, shows the chips, and creates nothing', async () => {
    resetTaskStore();
    window.history.replaceState(null, '', '/?add=Pay%20rent%20tomorrow%20%23home');
    render(<TaskInput />);
    const input = screen.getByLabelText('New task') as HTMLInputElement;
    expect(input.value).toBe('Pay rent tomorrow #home');
    expect(input).toHaveFocus();
    expect(window.location.search).toBe('');
    // quick add reads it live
    const chips = await screen.findByRole('list', { name: 'Recognised in this task' });
    expect(chips).toHaveTextContent('Tomorrow');
    expect(chips).toHaveTextContent('home');
    // not created until the user confirms
    expect(Object.keys(useTaskStore.getState().tasks)).toHaveLength(0);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(Object.values(useTaskStore.getState().tasks)).toHaveLength(1);
  });

  it('appends ?url= to the text', () => {
    resetTaskStore();
    window.history.replaceState(
      null,
      '',
      '/?text=Read%20this&url=https%3A%2F%2Fexample.com%2Farticle',
    );
    render(<TaskInput />);
    expect(screen.getByLabelText('New task')).toHaveValue('Read this https://example.com/article');
  });

  it('applies text remembered while signed out', () => {
    resetTaskStore();
    sessionStorage.setItem('tasks-pending-add', 'Call mum');
    render(<TaskInput />);
    expect(screen.getByLabelText('New task')).toHaveValue('Call mum');
    expect(screen.getByLabelText('New task')).toHaveFocus();
    expect(sessionStorage.getItem('tasks-pending-add')).toBeNull();
  });
});
