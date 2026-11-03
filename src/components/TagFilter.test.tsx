import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { resetTaskStore, useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';

beforeEach(() => {
  localStorage.clear();
  resetTaskStore();
  useUIStore.setState({ view: 'tree', tagFilter: null, filterOpen: false });
});

/** The "Filtered by #tag · Clear" line under the toolbar. */
const queryBanner = () =>
  screen.queryAllByRole('status').find((el) => el.textContent?.startsWith('Filtered by')) ?? null;

describe('active tag filter', () => {
  it('shows a readable #tag chip and clears from the banner', () => {
    act(() => {
      useTaskStore.getState().add({ title: 'Alpha', tags: ['work'] });
      useTaskStore.getState().add({ title: 'Beta', tags: ['home'] });
    });
    render(<App />);
    expect(queryBanner()).toBeNull();

    act(() => useUIStore.getState().setTagFilter('work'));
    const banner = queryBanner()!;
    expect(banner).not.toBeNull();
    expect(within(banner).getByText('#work')).toBeVisible();

    fireEvent.click(within(banner).getByRole('button', { name: 'Clear' }));
    expect(useUIStore.getState().tagFilter).toBeNull();
    expect(queryBanner()).toBeNull();
  });

  it('shows the banner in History too', () => {
    act(() => {
      const id = useTaskStore.getState().add({ title: 'Alpha', tags: ['work'] });
      useTaskStore.getState().toggle(id);
    });
    useUIStore.setState({ view: 'history', tagFilter: 'work' });
    render(<App />);
    expect(within(queryBanner()!).getByText('#work')).toBeVisible();
  });
});
