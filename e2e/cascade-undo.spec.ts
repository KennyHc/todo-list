import { expect, test } from '@playwright/test';
import { addTask, check, openMenu, row, signIn, titleBtn, uniqueSub } from './helpers';

test('checking every subtask completes the parent, and Undo reverts it', async ({ page }, info) => {
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

  // The last subtask completes the project: the whole thing leaves the Tree.
  await check(page, 'Ship it').click();
  await expect(check(page, 'Ship it')).toHaveCount(0);
  await expect(check(page, 'Launch')).toHaveCount(0);
  await expect(page.locator('li[data-row-id]')).toHaveCount(0);

  // Earlier toasts (one per completed subtask) are still fading out; wait for the latest alone.
  const undo = page.getByRole('button', { name: 'Undo' });
  await expect(undo).toHaveCount(1);
  await undo.click();
  // Undo brings the parent back with its open subtask; the first one stays done (in History).
  await expect(check(page, 'Ship it')).toHaveAttribute('aria-checked', 'false');
  await expect(check(page, 'Launch')).toHaveAttribute('aria-checked', 'false');
  await expect(check(page, 'Write copy')).toHaveCount(0);
});
