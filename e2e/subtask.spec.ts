import { expect, test } from '@playwright/test';
import { addTask, openMenu, row, signIn, titleBtn, uniqueSub } from './helpers';

test('adding a subtask on a phone keeps spaces and leaves no empty row', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile-chromium', 'phone flow');
  await signIn(page, uniqueSub(info));
  await addTask(page, 'Plan trip');
  await expect(row(page, 'Plan trip')).toBeVisible();

  const menu = await openMenu(page, 'Plan trip');
  await menu.getByRole('button', { name: 'Add subtask' }).click();
  await expect(menu).toBeHidden();

  const editor = page.getByRole('textbox', { name: 'Task title' });
  await expect(editor).toBeFocused();
  await page.keyboard.type('Book the flights to Rome');
  await page.keyboard.press('Enter');

  // Like desktop: saved, and a new empty sibling opens in edit mode with the keyboard up.
  await expect(titleBtn(page, 'Book the flights to Rome')).toBeVisible();
  await expect(page.locator('li[data-row-id]')).toHaveCount(3);
  await expect(editor).toHaveCount(1);
  await expect(editor).toHaveValue('');
  await expect(editor).toBeFocused();

  // Tapping elsewhere leaves the empty row: it is removed, not left behind.
  await page.getByRole('heading', { name: 'Tasks' }).tap();
  await expect(editor).toHaveCount(0);
  await expect(page.locator('li[data-row-id]')).toHaveCount(2);
  // Right after its parent, spaces kept.
  await expect(
    page.getByRole('button', { name: /^(Plan trip|Book the flights to Rome)$/ }),
  ).toHaveText(['Plan trip', 'Book the flights to Rome']);

  // Escape on the next empty sibling removes it too.
  await titleBtn(page, 'Book the flights to Rome').tap();
  await expect(editor).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('li[data-row-id]')).toHaveCount(3);
  await expect(editor).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(page.locator('li[data-row-id]')).toHaveCount(2);
});
