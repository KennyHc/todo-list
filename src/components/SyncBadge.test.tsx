import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '../store/auth';
import { useSyncStore } from '../sync/status';
import { SettingsPopover } from './SettingsPopover';

beforeEach(() => {
  useAuthStore.setState({
    status: 'signedIn',
    user: { uid: 'u1', name: 'Ada', email: 'ada@example.com', photoURL: null },
  });
  useSyncStore.setState({ syncStatus: 'ready' });
});

describe('sync status outside the account menu', () => {
  it('says nothing extra while synced', () => {
    render(<SettingsPopover />);
    expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('names the avatar and announces when offline, then announces the way back', () => {
    render(<SettingsPopover />);
    act(() => useSyncStore.setState({ syncStatus: 'offline' }));
    expect(
      screen.getByRole('button', { name: 'Account, Offline — changes will sync' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Offline — changes will sync');

    act(() => useSyncStore.setState({ syncStatus: 'ready' }));
    expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Synced');
  });

  it('names a sync error', () => {
    useSyncStore.setState({ syncStatus: 'error' });
    render(<SettingsPopover />);
    expect(screen.getByRole('button', { name: 'Account, Sync error' })).toBeInTheDocument();
  });
});
