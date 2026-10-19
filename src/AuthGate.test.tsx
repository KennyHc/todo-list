import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./sync/useCloudSync', () => ({ useCloudSync: vi.fn() }));
vi.mock('./App', () => ({ default: () => <div>the app</div> }));
vi.mock('./landing/Landing', () => ({ Landing: () => <div>landing page</div> }));

import { AuthGate } from './AuthGate';
import { useAuthStore } from './store/auth';
import { useSyncStore } from './sync/status';
import { useCloudSync } from './sync/useCloudSync';

const setAuth = (status: 'loading' | 'signedOut' | 'signedIn') =>
  useAuthStore.setState({
    status,
    user: status === 'signedIn' ? { uid: 'u', name: 'U', email: 'u@x.io', photoURL: null } : null,
  });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useSyncStore.setState({ syncStatus: 'loading', migratedCount: null });
});

describe('AuthGate', () => {
  it('starts cloud sync', () => {
    setAuth('signedOut');
    render(<AuthGate />);
    expect(useCloudSync).toHaveBeenCalled();
  });

  it('shows the splash while a returning user is loading', () => {
    localStorage.setItem('auth-hint', '1');
    setAuth('loading');
    render(<AuthGate />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByText('landing page')).not.toBeInTheDocument();
  });

  it('shows the landing page while loading without a hint', () => {
    setAuth('loading');
    render(<AuthGate />);
    expect(screen.getByText('landing page')).toBeInTheDocument();
  });

  it('shows the landing page when signed out', () => {
    localStorage.setItem('auth-hint', '1');
    setAuth('signedOut');
    render(<AuthGate />);
    expect(screen.getByText('landing page')).toBeInTheDocument();
  });

  it('shows the splash until the first sync finishes, then the app', () => {
    setAuth('signedIn');
    const { rerender } = render(<AuthGate />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByText('the app')).not.toBeInTheDocument();
    useSyncStore.setState({ syncStatus: 'ready' });
    rerender(<AuthGate />);
    expect(screen.getByText('the app')).toBeInTheDocument();
  });

  it('still shows the app when offline or after a sync error', () => {
    setAuth('signedIn');
    useSyncStore.setState({ syncStatus: 'offline' });
    const { rerender } = render(<AuthGate />);
    expect(screen.getByText('the app')).toBeInTheDocument();
    useSyncStore.setState({ syncStatus: 'error' });
    rerender(<AuthGate />);
    expect(screen.getByText('the app')).toBeInTheDocument();
  });
});
