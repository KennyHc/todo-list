import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { resetTaskStore, useTaskStore } from '../store/tasks';

beforeEach(() => {
  localStorage.clear();
  resetTaskStore();
});

describe('header stats', () => {
  it('spell out progress and effort left for screen readers and on hover', () => {
    const s = useTaskStore.getState();
    const a = s.add({ title: 'Write', difficulty: 2 });
    s.add({ title: 'Edit', difficulty: 3 });
    s.add({ title: 'Ship', difficulty: 1 });
    act(() => useTaskStore.getState().toggle(a));
    render(<App />);

    const count = screen.getByText('1 of 3 tasks done', { selector: 'span' }).parentElement;
    expect(count).toHaveAttribute('title', '1 of 3 tasks done');
    expect(count).toHaveTextContent('1/3');
    // The ring's SVG <title> gives it the same hover text.
    expect(document.querySelector('svg title')).toHaveTextContent('1 of 3 tasks done');
    const load = screen.getByText('4 points left', { selector: 'span' }).parentElement;
    expect(load).toHaveAttribute('title', '4 points left');
    expect(load).toHaveTextContent('Load 4');
  });

  it('uses the singular for one task and one point', () => {
    useTaskStore.getState().add({ title: 'Write', difficulty: 1 });
    render(<App />);

    expect(screen.getByText('0 of 1 task done', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('1 point left', { selector: 'span' })).toBeInTheDocument();
  });
});
