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

  await expect(titleBtn(page, 'Book the flights to Rome')).toBeVisible();
  // Right after its parent, and no empty row anywhere.
  await expect(page.locator('li[data-row-id]')).toHaveCount(2);
  await expect(
    page.getByRole('button', { name: /^(Plan trip|Book the flights to Rome)$/ }),
  ).toHaveText(['Plan trip', 'Book the flights to Rome']);
  await expect(editor).toHaveCount(0);
});
