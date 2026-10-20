import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../sync/deleteAccount', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sync/deleteAccount')>()),
  deleteAccount: vi.fn(),
}));

import { Landing } from '../landing/Landing';
import { useAuthStore } from '../store/auth';
import { useUIStore } from '../store/ui';
import { deleteAccount, DeleteAccountError } from '../sync/deleteAccount';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import { ExportBackupDialog } from './ExportBackupDialog';
import { SettingsPopover } from './SettingsPopover';

const mocked = vi.mocked(deleteAccount);

const setup = () =>
  render(
    <>
      <SettingsPopover />
      <DeleteAccountDialog />
      <ExportBackupDialog />
    </>,
  );

const openDialog = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Account' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete account…' }));
  return screen.findByRole('dialog', { name: 'Delete your account?' });
};

beforeEach(() => {
  mocked.mockReset();
  sessionStorage.clear();
  useUIStore.setState({ deleteAccountOpen: false, aiDialog: null });
  useAuthStore.setState({
    status: 'signedIn',
    user: { uid: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', photoURL: null },
  });
});

describe('DeleteAccountDialog', () => {
  it('opens from the last item of the avatar menu', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    const items = await screen.findAllByRole('menuitem');
    expect(items[items.length - 1]).toHaveTextContent('Delete account…');
    fireEvent.click(items[items.length - 1]);
    const dialog = await screen.findByRole('dialog', { name: 'Delete your account?' });
    expect(dialog).toHaveTextContent(/permanently deletes your account and all your tasks/);
    expect(within(dialog).getByLabelText('Type delete to confirm')).toHaveFocus();
  });

  it('enables the button only once "delete" is typed, ignoring case and spaces', async () => {
    setup();
    const dialog = await openDialog();
    const button = within(dialog).getByRole('button', { name: 'Delete everything' });
    const input = within(dialog).getByLabelText('Type delete to confirm');
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: 'delet' } });
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: 'delete' } });
    expect(button).toBeEnabled();
    fireEvent.change(input, { target: { value: 'Delete ' } });
    expect(button).toBeEnabled();
    fireEvent.change(input, { target: { value: 'delete it' } });
    expect(button).toBeDisabled();
  });

  it('calls deleteAccount and stays busy while it runs', async () => {
    mocked.mockReturnValue(new Promise(() => {}));
    setup();
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText('Type delete to confirm'), {
      target: { value: 'delete' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete everything' }));
    expect(mocked).toHaveBeenCalledTimes(1);
    const busy = await within(dialog).findByRole('button', { name: 'Deleting…' });
    expect(busy).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();

    // Escape does not close it while busy.
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(useUIStore.getState().deleteAccountOpen).toBe(true);
  });

  it('shows the error inline and lets the user retry', async () => {
    mocked.mockRejectedValueOnce(new DeleteAccountError('offline'));
    setup();
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText('Type delete to confirm'), {
      target: { value: 'delete' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete everything' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "You're offline. Connect to delete your account.",
    );
    expect(within(dialog).getByRole('button', { name: 'Delete everything' })).toBeEnabled();
  });

  it('says nothing when the re-authentication popup is cancelled', async () => {
    mocked.mockRejectedValueOnce(new DeleteAccountError('cancelled'));
    setup();
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText('Type delete to confirm'), {
      target: { value: 'delete' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete everything' }));
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Delete everything' })).toBeEnabled(),
    );
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('closes with Escape or Cancel when idle', async () => {
    setup();
    const dialog = await openDialog();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(useUIStore.getState().deleteAccountOpen).toBe(false));
    expect(mocked).not.toHaveBeenCalled();
  });

  it('opens the export dialog from "Export a backup first"', async () => {
    setup();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Export a backup first' }));
    expect(await screen.findByRole('dialog', { name: 'Export backup' })).toBeInTheDocument();
    expect(useUIStore.getState().aiDialog).toBe('export');
  });
});

describe('Landing after deletion', () => {
  it('shows the notice once and clears the flag', () => {
    sessionStorage.setItem('account-deleted', '1');
    const { unmount } = render(<Landing />);
    expect(screen.getByRole('status')).toHaveTextContent('Your account and data were deleted.');
    expect(sessionStorage.getItem('account-deleted')).toBeNull();
    unmount();
    act(() => {});
    render(<Landing />);
    expect(screen.queryByText('Your account and data were deleted.')).not.toBeInTheDocument();
  });
});
