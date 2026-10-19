import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { serializeBackup } from '../lib/backup';
import { useAiDraft } from '../store/aiDraft';
import { useImportDraft } from '../store/importDraft';
import { resetTaskStore, useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';
import type { PersistedTasks } from '../store/tasks';

let writeText: ReturnType<typeof vi.fn>;

const restored: PersistedTasks = {
  tasks: {
    r1: {
      id: 'r1',
      title: 'Restored task',
      done: false,
      collapsed: false,
      childIds: [],
      parentId: null,
      tags: [],
      dueDate: null,
      difficulty: 1,
      color: 'none',
      createdAt: 1000,
    },
  },
  rootIds: ['r1'],
  history: [],
};
const BACKUP = serializeBackup(restored, new Date('2026-10-19T10:00:00Z'));
const AI_REPLY = '```json\n{"tasks":[{"title":"Plan trip"},{"title":"Book flights"}]}\n```';

beforeEach(() => {
  localStorage.clear();
  resetTaskStore();
  useAiDraft.getState().reset();
  useImportDraft.getState().reset();
  useUIStore.setState({ view: 'deadline', tagFilter: 'x', aiDialog: null, revealFlash: null });
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

afterEach(() => {
  useUIStore.setState({ aiDialog: null });
});

const open = (dialog: 'export' | 'paste') => act(() => useUIStore.getState().setAiDialog(dialog));
const pasteInto = (dialog: HTMLElement, value: string) =>
  fireEvent.change(within(dialog).getByLabelText('Paste here'), { target: { value } });

describe('Export backup dialog', () => {
  it('previews the backup and copies it to the clipboard', async () => {
    useTaskStore.getState().add({ title: 'Buy oat milk' });
    render(<App />);
    open('export');
    const dialog = await screen.findByRole('dialog', { name: 'Export backup' });
    expect(within(dialog).getByLabelText('Backup preview')).toHaveTextContent('Buy oat milk');
    expect(within(dialog).getByText(/1 task · 0 history entries · \d+\.\d KB/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Download .json' })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = JSON.parse(writeText.mock.calls[0][0]);
    expect(copied).toMatchObject({ app: 'tasks', version: 2 });
    expect(Object.values(copied.tasks as Record<string, { title: string }>)[0].title).toBe(
      'Buy oat milk',
    );
    expect(await within(dialog).findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });
});

describe('Import dialog', () => {
  it('shows the backup card for a pasted backup and restores after confirming', async () => {
    useTaskStore.getState().add({ title: 'Existing task' });
    render(<App />);
    open('paste');
    const dialog = await screen.findByRole('dialog', { name: 'Import' });
    pasteInto(dialog, BACKUP);

    expect(await within(dialog).findByText(/Full backup · .*2026 · 1 task/)).toBeInTheDocument();
    expect(
      within(dialog).getByText('Replaces your current list. You can undo right after.'),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restore backup' }));

    const confirm = await screen.findByRole('alertdialog', { name: 'Replace all tasks?' });
    expect(Object.values(useTaskStore.getState().tasks)[0].title).toBe('Existing task');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Replace' }));

    const s = useTaskStore.getState();
    expect(Object.keys(s.tasks)).toEqual(['r1']);
    expect(useUIStore.getState()).toMatchObject({ view: 'tree', tagFilter: null, aiDialog: null });
    expect(useImportDraft.getState().text).toBe('');
    expect(await screen.findByText('Restored backup (1 task)')).toBeInTheDocument();
  });

  it('adds the tasks from a pasted AI reply', async () => {
    useTaskStore.getState().add({ title: 'Existing task' });
    render(<App />);
    open('paste');
    const dialog = await screen.findByRole('dialog', { name: 'Import' });
    pasteInto(dialog, AI_REPLY);
    expect(await within(dialog).findByText('2 tasks')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add 2 tasks' }));

    const s = useTaskStore.getState();
    expect(s.rootIds.map((id) => s.tasks[id].title)).toEqual([
      'Existing task',
      'Plan trip',
      'Book flights',
    ]);
    expect(await screen.findByText('Added 2 tasks from AI')).toBeInTheDocument();
  });

  it('shows an error for garbage and keeps the button disabled', async () => {
    render(<App />);
    open('paste');
    const dialog = await screen.findByRole('dialog', { name: 'Import' });
    pasteInto(dialog, 'just some words');
    expect(await within(dialog).findByText(/Couldn.t find any JSON/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Import' })).toBeDisabled();
  });

  it('fills the textarea from a chosen file and detects it', async () => {
    render(<App />);
    open('paste');
    const dialog = await screen.findByRole('dialog', { name: 'Import' });
    const input = within(dialog).getByLabelText('Choose a file', { selector: 'input' });
    const file = new File([BACKUP], 'backup.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(BACKUP) });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    await waitFor(() => expect(within(dialog).getByLabelText('Paste here')).toHaveValue(BACKUP));
    expect(await within(dialog).findByText(/Full backup/)).toBeInTheDocument();
  });

  it('keeps the pasted text when closed and reopened', async () => {
    render(<App />);
    open('paste');
    let dialog = await screen.findByRole('dialog', { name: 'Import' });
    pasteInto(dialog, AI_REPLY);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    open('paste');
    dialog = await screen.findByRole('dialog', { name: 'Import' });
    expect(within(dialog).getByLabelText('Paste here')).toHaveValue(AI_REPLY);
  });

  it('switches to the AI prompt from the empty hint', async () => {
    render(<App />);
    open('paste');
    const dialog = await screen.findByRole('dialog', { name: 'Import' });
    fireEvent.click(within(dialog).getByRole('button', { name: /Get a prompt/ }));
    expect(await screen.findByRole('dialog', { name: 'Import from AI' })).toBeInTheDocument();
    expect(screen.getByLabelText('What do you want to plan?')).toBeInTheDocument();
  });

  it('accepts a backup in the Import from AI paste step too', async () => {
    render(<App />);
    act(() => {
      useAiDraft.getState().set({ step: 2 });
      useUIStore.getState().setAiDialog('import');
    });
    const dialog = await screen.findByRole('dialog', { name: 'Import from AI' });
    fireEvent.change(within(dialog).getByLabelText(/Paste the AI/), { target: { value: BACKUP } });
    expect(await within(dialog).findByText(/Full backup/)).toBeInTheDocument();
  });
});

describe('global paste', () => {
  const pasteOnPage = (text: string) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
    act(() => {
      document.body.dispatchEvent(event);
    });
  };

  it('opens the Import dialog prefilled for a pasted backup', async () => {
    render(<App />);
    pasteOnPage(BACKUP);
    const dialog = await screen.findByRole('dialog', { name: 'Import' });
    expect(within(dialog).getByLabelText('Paste here')).toHaveValue(BACKUP);
    expect(await within(dialog).findByText(/Full backup/)).toBeInTheDocument();
  });

  it('ignores plain text', () => {
    render(<App />);
    pasteOnPage('buy milk and eggs');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useUIStore.getState().aiDialog).toBeNull();
  });
});
