import { expect, test } from '@playwright/test';
import { addTask, check, openMenu, row, signIn, titleBtn, uniqueSub } from './helpers';

// #74: checking subtasks never completes their parent; only the parent's own check does.
test('every subtask checked leaves the parent open; its own check and Undo', async ({
  page,
}, info) => {
  await signIn(page, uniqueSub(info));
  await addTask(page, 'Launch');
  await expect(row(page, 'Launch')).toBeVisible();

  for (const title of ['Write copy', 'Ship it']) {
    const menu = await openMenu(page, 'Launch');
    await menu.getByRole('button', { name: 'Add subtask' }).click();
    await expect(menu).toBeHidden();
    const editor = page.getByRole('textbox', { name: 'Task title' });
    await expect(editor).toBeFocused();
    await page.keyboard.type(title);
    await page.keyboard.press('Enter');
    await expect(titleBtn(page, title)).toBeVisible();
    // Desktop Enter opens the next empty sibling; Escape drops it. Phones already finished.
    if (await editor.isVisible()) await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
  }

  // A completed subtask leaves the Tree at once; its parent stays and shows the progress.
  await check(page, 'Write copy').click();
  await expect(check(page, 'Write copy')).toHaveCount(0);
  await expect(check(page, 'Launch')).toHaveAttribute('aria-checked', 'false');
  await expect(row(page, 'Launch')).toContainText('1/2');

  // The last subtask leaves too, but the project stays open with all its subtasks done.
  await check(page, 'Ship it').click();
  await expect(check(page, 'Ship it')).toHaveCount(0);
  await expect(page.getByText(/Completed “Ship it”/)).toBeVisible();
  await expect(check(page, 'Launch')).toHaveAttribute('aria-checked', 'false');
  await expect(row(page, 'Launch')).toContainText('2/2');

  // Checking the project itself completes it: the whole thing leaves the Tree.
  await check(page, 'Launch').click();
  await expect(check(page, 'Launch')).toHaveCount(0);
  await expect(page.locator('li[data-row-id]')).toHaveCount(0);

  // Earlier toasts (one per completed task) are still fading out; wait for the latest alone.
  const undo = page.getByRole('button', { name: 'Undo' });
  await expect(undo).toHaveCount(1);
  await undo.click();
  // Undo brings the project back, open; its subtasks stay done (in History).
  await expect(check(page, 'Launch')).toHaveAttribute('aria-checked', 'false');
  await expect(row(page, 'Launch')).toContainText('2/2');
  await expect(check(page, 'Write copy')).toHaveCount(0);
  await expect(check(page, 'Ship it')).toHaveCount(0);
});
