import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '../store/ui';
import { NoticeToast } from './NoticeToast';

beforeEach(() => useUIStore.setState({ notice: null }));

describe('NoticeToast', () => {
  it('renders an action button that runs and dismisses the notice', () => {
    const run = vi.fn();
    render(<NoticeToast />);
    act(() =>
      useUIStore.getState().showNotice('New version ready', {
        persistent: true,
        action: { label: 'Reload', run },
      }),
    );
    expect(screen.getByText('New version ready')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(run).toHaveBeenCalledOnce();
    expect(useUIStore.getState().notice).toBeNull();
  });

  it('renders no action button for a plain notice', () => {
    render(<NoticeToast />);
    act(() => useUIStore.getState().showNotice('Backup copied'));
    expect(screen.getByText('Backup copied')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
  });
});
