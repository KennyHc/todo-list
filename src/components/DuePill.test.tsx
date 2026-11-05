import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays } from '../lib/dates';
import { todayISO } from '../lib/views';
import { DuePill } from './DuePill';

describe('DuePill display', () => {
  const tomorrow = addDays(todayISO(), 1);

  it('says the full label by default', () => {
    render(<DuePill dueDate={tomorrow} />);
    expect(screen.getByText('Tomorrow')).toBeInTheDocument();
  });

  it('shows only the weekday under a Next 7 days header', () => {
    const date = addDays(todayISO(), 4);
    render(<DuePill dueDate={date} display="weekday" />);
    expect(screen.getByText(/^[A-Za-z]+$/)).toBeInTheDocument();
  });

  it('shows just the repeat icon when the section already says it', () => {
    render(<DuePill dueDate={tomorrow} display="icon" repeat={{ every: 'day' }} />);
    expect(screen.queryByText('Tomorrow')).toBeNull();
    expect(screen.getByTestId('repeat-icon')).toBeInTheDocument();
  });
});

describe('DuePill across midnight', () => {
  afterEach(() => vi.useRealTimers());

  it('turns "Tomorrow" into "Today" when the day changes, without a reload', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 5, 23, 59, 30));
    render(<DuePill dueDate="2026-11-06" />);
    expect(screen.getByText('Tomorrow')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText('Today')).toBeInTheDocument();
  });
});
