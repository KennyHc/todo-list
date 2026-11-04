import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
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
    const main = screen.getByRole('main');
    const google = within(main).getAllByRole('button', { name: /continue with google/i });
    expect(google).toHaveLength(2);
    google.forEach((b) => fireEvent.click(b));
    expect(onSignIn).toHaveBeenCalledTimes(2);
    // The header button uses the same label as the hero.
    const header = document.querySelector('header')!;
    fireEvent.click(within(header).getByRole('button', { name: 'Continue with Google' }));
    expect(onSignIn).toHaveBeenCalledTimes(3);
  });

  it('shows an error message', () => {
    render(<LandingPage onSignIn={() => {}} error="Sign-in was cancelled" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in was cancelled');
  });

  it('disables the buttons while signing in', () => {
    const onSignIn = vi.fn();
    render(<LandingPage onSignIn={onSignIn} signingIn />);
    const buttons = screen.getAllByRole('button', { name: /continue with google/i });
    expect(buttons).toHaveLength(3);
    for (const b of buttons) expect(b).toBeDisabled();
  });

  it('shows the demo as an inert preview, out of the Tab order', () => {
    vi.useFakeTimers();
    render(<LandingPage onSignIn={() => {}} />);
    const preview = screen.getByRole('img', { name: 'Preview' });
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    const card = preview.querySelector('[inert]');
    expect(card).not.toBeNull();
    // The rows are still drawn, just not reachable.
    expect(card!.querySelectorAll('button[role="checkbox"]').length).toBe(4);
  });

  it('renders the feature cards and closing call to action visible without scrolling', () => {
    render(<LandingPage onSignIn={() => {}} />);
    const below = [
      screen.getByRole('heading', { name: 'Break it down' }),
      screen.getByRole('heading', { name: /one click away/i }),
    ];
    for (const el of below) {
      for (let node: HTMLElement | null = el; node; node = node.parentElement) {
        expect(node.style.opacity).not.toBe('0');
      }
    }
  });
});

describe('useDemo', () => {
  it('plays the script: the subtasks, then the parent, which never completes by itself', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDemo({ enabled: true, active: true }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.typed.length).toBeGreaterThan(0);
    // Subtasks are checked at about 4.1 s, 5.0 s and 5.9 s, the parent at about 6.8 s.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    const tasks = () => Object.values(result.current.tree.tasks);
    const parent = () => tasks().find((t) => t.parentId === null)!;
    expect(tasks()).toHaveLength(4);
    expect(tasks().filter((t) => t.parentId !== null && t.done)).toHaveLength(3);
    expect(parent().done).toBe(false);
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(tasks().every((t) => t.done)).toBe(true);
    expect(result.current.toggled).toBe(parent().id);
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
