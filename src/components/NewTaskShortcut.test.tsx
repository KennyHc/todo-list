import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { resetTaskStore } from '../store/tasks';
import { TaskInput } from './TaskInput';

afterEach(() => window.history.replaceState(null, '', '/'));

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
