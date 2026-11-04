import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseQuickAdd } from '../lib/quickAdd';
import { resetTaskStore } from '../store/tasks';
import { SYNTAX_HINTS } from './SyntaxHint';
import { TaskInput } from './TaskInput';

// Tue 20 Oct 2026, local time.
const NOW = new Date(2026, 9, 20, 10, 30);
const parse = (input: string) => parseQuickAdd(input, { now: NOW, locale: 'en-US', repeats: true });

beforeEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  resetTaskStore();
});

describe('syntax hint content', () => {
  const forms = SYNTAX_HINTS.flatMap((h) => h.forms.map((f) => [h.name, f, h.kind] as const));

  it.each(forms)('%s: "%s" is recognised by the parser', (_name, form, kind) => {
    const r = parse(`Task ${form}`);
    expect(r.tokens.map((t) => t.kind)).toEqual([kind]);
    expect(r.title).toBe('Task');
  });

  it.each(SYNTAX_HINTS.map((h) => [h.name, h.example, h.kind] as const))(
    '%s: the example "%s" uses it',
    (_name, example, kind) => {
      expect(parse(example).tokens.map((t) => t.kind)).toContain(kind);
    },
  );

  it('the "from … by …" example gives a start date and a due date', () => {
    expect(parse('Renew passport from nov 1 by nov 30')).toMatchObject({
      title: 'Renew passport',
      startDate: '2026-11-01',
      dueDate: '2026-11-30',
    });
  });
});

describe('syntax hint in the composer', () => {
  const open = () => {
    render(<TaskInput />);
    fireEvent.focus(screen.getByLabelText('New task'));
    const button = screen.getByRole('button', { name: 'Typing shortcuts' });
    fireEvent.click(button);
    return button;
  };

  it('opens from a "?" button in the toolbar and lists every hint', () => {
    const button = open();
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const dialog = screen.getByRole('dialog', { name: 'Typing shortcuts' });
    const items = within(dialog).getAllByRole('listitem');
    expect(items).toHaveLength(SYNTAX_HINTS.length);
    expect(within(dialog).getByText('#tag')).toBeInTheDocument();
    expect(within(dialog).getByText('every monday')).toBeInTheDocument();
  });

  it('closes on Escape and gives focus back to the button', async () => {
    const button = open();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Typing shortcuts' })).not.toBeInTheDocument(),
    );
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });

  it('toggles closed when the button is clicked again', async () => {
    const button = open();
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Typing shortcuts' })).not.toBeInTheDocument(),
    );
  });
});
