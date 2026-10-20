import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../pwa/install', () => ({
  canPromptInstall: vi.fn(() => false),
  isIosSafari: vi.fn(() => false),
  isStandalone: vi.fn(() => false),
  promptInstall: vi.fn(),
  subscribeInstall: () => () => {},
}));

import * as install from '../pwa/install';
import { useAuthStore } from '../store/auth';
import { SettingsPopover } from './SettingsPopover';

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Account' }));

beforeEach(() => {
  useAuthStore.setState({
    status: 'signedIn',
    user: { uid: 'u1', name: 'Ada', email: 'ada@example.com', photoURL: null },
  });
});
afterEach(() => vi.clearAllMocks());

describe('install item in the account menu', () => {
  it('is hidden when nothing can be installed', () => {
    render(<SettingsPopover />);
    open();
    expect(screen.queryByRole('menuitem', { name: 'Install app' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Add to Home Screen' })).toBeNull();
  });

  it('offers "Install app" when the browser can prompt, and prompts on click', () => {
    vi.mocked(install.canPromptInstall).mockReturnValue(true);
    render(<SettingsPopover />);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Install app' }));
    expect(install.promptInstall).toHaveBeenCalledOnce();
  });

  it('explains Add to Home Screen on iOS Safari', () => {
    vi.mocked(install.canPromptInstall).mockReturnValue(false);
    vi.mocked(install.isIosSafari).mockReturnValue(true);
    render(<SettingsPopover />);
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add to Home Screen' }));
    expect(screen.getByText('Add to Home Screen', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByLabelText('Share')).toBeInTheDocument();
    expect(screen.getByText(/tasks-app-956r6\.web\.app\/\?add=/)).toBeInTheDocument();
  });

  it('keeps the quick-capture tip out of sight until the iOS explainer is open', () => {
    vi.mocked(install.canPromptInstall).mockReturnValue(false);
    vi.mocked(install.isIosSafari).mockReturnValue(true);
    render(<SettingsPopover />);
    open();
    expect(screen.queryByText(/\?add=/)).toBeNull();
  });

  it('shows nothing when already installed', () => {
    vi.mocked(install.canPromptInstall).mockReturnValue(true);
    vi.mocked(install.isStandalone).mockReturnValue(true);
    render(<SettingsPopover />);
    open();
    expect(screen.queryByRole('menuitem', { name: 'Install app' })).toBeNull();
  });
});
