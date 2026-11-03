import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { resetTaskStore, useTaskStore } from '../store/tasks';
import { useUIStore } from '../store/ui';

const touch = vi.hoisted(() => ({ value: true }));
vi.mock('../hooks/useIsTouch', () => ({ useIsTouch: () => touch.value }));

beforeEach(() => {
  touch.value = true;
  localStorage.clear();
  resetTaskStore();
  useUIStore.setState({ view: 'tree', tagFilter: null, focusedId: null, deleteRequestId: null });
});

function seed() {
  const s = useTaskStore.getState();
  const leaf = s.add({ title: 'Leaf', parentId: null });
  const parent = s.add({ title: 'Parent', parentId: null });
  s.add({ title: 'Child', parentId: parent });
  return { leaf, parent };
}

const rowOf = (title: string) => {
  const li = screen.getByText(title).closest('li') as HTMLElement;
  // The swipe surface is the element that owns the pointer handlers: the row's parent.
  return li.querySelector('[class*="surface"]') as HTMLElement;
};

const tick = () => new Promise((r) => setTimeout(r, 25));

/** Fires a pointer event; happy-dom derives pageX/pageY (which framer reads) as 0, so set them. */
function fire(target: Element | Window, type: string, x: number, y: number, up = false) {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    buttons: up ? 0 : 1,
    clientX: x,
    clientY: y,
  });
  Object.defineProperty(event, 'pageX', { value: x });
  Object.defineProperty(event, 'pageY', { value: y });
  fireEvent(target, event);
}

/** A touch drag by (dx, dy) in a few steps. */
async function swipe(el: HTMLElement, dx: number, dy = 0) {
  fire(el, 'pointerdown', 200, 100);
  await tick();
  for (let i = 1; i <= 6; i++) {
    fire(window, 'pointermove', 200 + (dx * i) / 6, 100 + (dy * i) / 6);
    await tick();
  }
  fire(window, 'pointerup', 200 + dx, 100 + dy, true);
  await tick();
}

describe('swipe gestures', () => {
  it('a right swipe past the threshold toggles the task', async () => {
    const { leaf } = seed();
    render(<App />);
    await act(async () => await swipe(rowOf('Leaf'), 140));
    await waitFor(() => expect(useTaskStore.getState().tasks[leaf].done).toBe(true));
  });

  it('a short swipe does nothing', async () => {
    const { leaf } = seed();
    render(<App />);
    await act(async () => await swipe(rowOf('Leaf'), 50));
    await act(async () => await swipe(rowOf('Leaf'), -50));
    expect(useTaskStore.getState().tasks[leaf].done).toBe(false);
    expect(useTaskStore.getState().tasks[leaf]).toBeDefined();
  });

  it('a mostly vertical pan does nothing', async () => {
    const { leaf } = seed();
    render(<App />);
    await act(async () => await swipe(rowOf('Leaf'), 120, 150));
    expect(useTaskStore.getState().tasks[leaf].done).toBe(false);
  });

  it('a left swipe on a leaf removes it', async () => {
    const { leaf } = seed();
    render(<App />);
    await act(async () => await swipe(rowOf('Leaf'), -140));
    await waitFor(() => expect(useTaskStore.getState().tasks[leaf]).toBeUndefined());
  });

  it('a left swipe on a parent opens the confirm dialog', async () => {
    const { parent } = seed();
    render(<App />);
    await act(async () => await swipe(rowOf('Parent'), -140));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(useTaskStore.getState().tasks[parent]).toBeDefined();
  });

  it('does not start on a control', async () => {
    const { leaf } = seed();
    render(<App />);
    const box = screen.getByRole('checkbox', { name: 'Done: Leaf' });
    await act(async () => await swipe(box, 140));
    expect(useTaskStore.getState().tasks[leaf].done).toBe(false);
  });

  it('does nothing without a touch device', async () => {
    touch.value = false;
    const { leaf } = seed();
    render(<App />);
    await act(async () => await swipe(rowOf('Leaf'), 140));
    await act(async () => await swipe(rowOf('Leaf'), -140));
    expect(useTaskStore.getState().tasks[leaf]?.done).toBe(false);
  });
});
