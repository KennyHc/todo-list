import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemoCard } from './DemoCard';
import { LandingPage } from './LandingPage';
import { buildDemoTree, DEMO_COLOR, useDemo } from './useDemo';

afterEach(() => {
  vi.useRealTimers();
});

describe('LandingPage', () => {
  it('renders a single h1', () => {
    render(<LandingPage onSignIn={() => {}} />);
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(/write it down/i);
  });

  it('the demo shows the row colour edge: an explicit parent colour that its subtasks inherit', () => {
    const { tree, parentId } = buildDemoTree(1);
    expect(tree.tasks[parentId].color).toBe(DEMO_COLOR);
    // Let the autoplay script type the task and add its subtasks.
    vi.useFakeTimers();
    render(<DemoCard />);
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    const rows = document.querySelectorAll('[data-row-color]');
    expect(rows).toHaveLength(4); // the parent and its three subtasks
    rows.forEach((row) => expect(row).toHaveAttribute('data-row-color', DEMO_COLOR));
  });

  it('calls onSignIn from every call to action', () => {
    const onSignIn = vi.fn();
    render(<LandingPage onSignIn={onSignIn} />);
    const google = screen.getAllByRole('button', { name: /continue with google/i });
    expect(google).toHaveLength(2);
    google.forEach((b) => fireEvent.click(b));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onSignIn).toHaveBeenCalledTimes(3);
  });

  it('shows an error message', () => {
    render(<LandingPage onSignIn={() => {}} error="Sign-in was cancelled" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in was cancelled');
  });

  it('disables the buttons while signing in', () => {
    const onSignIn = vi.fn();
    render(<LandingPage onSignIn={onSignIn} signingIn />);
    for (const b of screen.getAllByRole('button', { name: /continue with google/i })) {
      expect(b).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  });

  it('has a labelled interactive demo whose checkboxes are real buttons', () => {
    vi.useFakeTimers();
    render(<LandingPage onSignIn={() => {}} />);
    expect(screen.getByRole('group', { name: 'Interactive demo' })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getAllByRole('checkbox').length).toBe(4);
  });
});

describe('useDemo', () => {
  it('plays the script and auto-completes the parent', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDemo({ enabled: true, active: true }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.typed.length).toBeGreaterThan(0);
    act(() => {
      vi.advanceTimersByTime(7500);
    });
    const tasks = Object.values(result.current.tree.tasks);
    expect(tasks).toHaveLength(4);
    expect(tasks.every((t) => t.done)).toBe(true);
  });

  it('does nothing when disabled or inactive', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDemo({ enabled: false, active: true }));
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current.tree.rootIds).toHaveLength(0);
  });

  it('pauses on interaction and restarts after 6s', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDemo({ enabled: true, active: true }));
    act(() => {
      vi.advanceTimersByTime(4200);
    });
    const childId = Object.values(result.current.tree.tasks).find((t) => t.parentId)!.id;
    act(() => result.current.toggle(childId));
    const before = Object.keys(result.current.tree.tasks).length;
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(Object.keys(result.current.tree.tasks).length).toBe(before);
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(result.current.tree.rootIds).toHaveLength(0);
  });
});
