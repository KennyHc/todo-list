import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { useAiDraft } from '../store/aiDraft';
import { resetTaskStore, useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  resetTaskStore();
  useAiDraft.getState().reset();
  useUIStore.setState({ view: 'deadline', tagFilter: 'x', aiDialog: null, revealFlash: null });
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

afterEach(() => {
  useUIStore.setState({ aiDialog: null });
});

const open = (dialog: 'copy' | 'import') => act(() => useUIStore.getState().setAiDialog(dialog));

const REPLY = `Here you go!

\`\`\`json
{ "format": "tasks-ai-v1", "tasks": [
  { "title": "Launch site", "subtasks": [
    { "title": "Write copy", "difficulty": 2, "tags": ["Content"] },
    { "title": "Deploy", "difficulty": 3, "due": "2026-11-15" }
  ] },
  { "title": "Buy domain", "difficulty": 1 }
] }
\`\`\`
Good luck!`;

const paste = (text: string) =>
  fireEvent.change(screen.getByLabelText(/Paste the AI/), { target: { value: text } });

describe('Copy for AI', () => {
  it('copies a prompt that contains the task titles', async () => {
    useTaskStore.getState().add({ title: 'Buy oat milk' });
    render(<App />);
    open('copy');
    const dialog = await screen.findByRole('dialog', { name: 'Copy for AI' });
    expect(within(dialog).getByRole('switch', { name: 'Include completed tasks' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(within(dialog).getByLabelText('Prompt preview')).toHaveTextContent('Buy oat milk');
    expect(within(dialog).getByText(/tokens/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy prompt' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain('Buy oat milk');
    expect(writeText.mock.calls[0][0]).toContain('```json');
    expect(await within(dialog).findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(within(dialog).getByRole('status')).toHaveTextContent('Copied to clipboard');
  });

  it('appends a suggested question and toggles completed tasks', async () => {
    const id = useTaskStore.getState().add({ title: 'Finished chore' });
    useTaskStore.getState().toggle(id);
    render(<App />);
    open('copy');
    const dialog = await screen.findByRole('dialog', { name: 'Copy for AI' });
    const preview = within(dialog).getByLabelText('Prompt preview');
    expect(preview).toHaveTextContent('"tasks": []');
    fireEvent.click(within(dialog).getByRole('switch'));
    expect(preview).toHaveTextContent('"title": "Finished chore", "done": true');

    fireEvent.click(within(dialog).getByRole('button', { name: 'What should I focus on today?' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toMatch(/help me with: \n\nWhat should I focus on today\?$/);
  });

  it('closes on Escape', async () => {
    render(<App />);
    open('copy');
    const dialog = await screen.findByRole('dialog', { name: 'Copy for AI' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Copy for AI' })).toBeNull());
  });
});

describe('Import from AI', () => {
  it('copies the import prompt with the goal, then moves to the paste step', async () => {
    render(<App />);
    open('import');
    const dialog = await screen.findByRole('dialog', { name: 'Import from AI' });
    fireEvent.change(within(dialog).getByLabelText('What do you want to plan?'), {
      target: { value: 'Launch my portfolio' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy prompt' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain('My goal: Launch my portfolio');
    await screen.findByLabelText(/Paste the AI/, undefined, { timeout: 3000 });
  });

  it('previews a fenced reply, adds the tasks with nesting and shows the undo toast', async () => {
    useTaskStore.getState().add({ title: 'Existing' });
    render(<App />);
    open('import');
    const dialog = await screen.findByRole('dialog', { name: 'Import from AI' });
    fireEvent.click(within(dialog).getByRole('button', { name: /Next: paste reply/ }));
    paste(REPLY);

    expect(await within(dialog).findByText('4 tasks')).toBeInTheDocument();
    expect(within(dialog).getByText('Write copy')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add 4 tasks' }));

    const s = useTaskStore.getState();
    expect(s.rootIds).toHaveLength(3);
    const launch = s.tasks[s.rootIds[1]];
    expect(launch.title).toBe('Launch site');
    expect(launch.childIds.map((id) => s.tasks[id].title)).toEqual(['Write copy', 'Deploy']);
    expect(s.tasks[launch.childIds[0]].tags).toEqual(['content']);
    expect(s.tasks[launch.childIds[1]].dueDate).toBe('2026-11-15');
    expect(useUIStore.getState()).toMatchObject({ view: 'tree', tagFilter: null, aiDialog: null });
    expect(useAiDraft.getState().reply).toBe('');

    const toast = await screen.findByText('Added 4 tasks from AI');
    expect(toast).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(useTaskStore.getState().rootIds).toHaveLength(1);
  });

  it('shows an error for an invalid paste and keeps Add disabled', async () => {
    render(<App />);
    open('import');
    const dialog = await screen.findByRole('dialog', { name: 'Import from AI' });
    fireEvent.click(within(dialog).getByRole('button', { name: /Next: paste reply/ }));
    paste('Sorry, I cannot help with that.');
    expect(await within(dialog).findByText(/Couldn.t find any JSON/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add 0 tasks' })).toBeDisabled();
  });

  it('asks for confirmation before replacing the list', async () => {
    useTaskStore.getState().add({ title: 'Old task' });
    render(<App />);
    open('import');
    const dialog = await screen.findByRole('dialog', { name: 'Import from AI' });
    fireEvent.click(within(dialog).getByRole('button', { name: /Next: paste reply/ }));
    paste(REPLY);
    await within(dialog).findByText('4 tasks');
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Replace my list' }));
    expect(
      within(dialog).getByText('This replaces all current tasks. You can undo right after.'),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Replace with 4 tasks' }));

    const confirm = await screen.findByRole('alertdialog', { name: 'Replace all tasks?' });
    // Nothing happened yet.
    expect(useTaskStore.getState().rootIds).toHaveLength(1);
    expect(Object.values(useTaskStore.getState().tasks)[0].title).toBe('Old task');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Replace' }));

    const s = useTaskStore.getState();
    expect(s.rootIds.map((id) => s.tasks[id].title)).toEqual(['Launch site', 'Buy domain']);
    expect(await screen.findByText('Replaced list with 4 tasks from AI')).toBeInTheDocument();
  });

  it('keeps the goal and the paste when the dialog is closed and reopened', async () => {
    render(<App />);
    open('import');
    let dialog = await screen.findByRole('dialog', { name: 'Import from AI' });
    fireEvent.change(within(dialog).getByLabelText('What do you want to plan?'), {
      target: { value: 'My goal text' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /Next: paste reply/ }));
    paste(REPLY);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    open('import');
    dialog = await screen.findByRole('dialog', { name: 'Import from AI' });
    expect(within(dialog).getByLabelText(/Paste the AI/)).toHaveValue(REPLY);
    expect(await within(dialog).findByText('4 tasks')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Back' }));
    expect(within(dialog).getByLabelText('What do you want to plan?')).toHaveValue('My goal text');
  });
});
