import { expect, test } from '@playwright/test';
import { addTask, row, signIn, uniqueSub } from './helpers';

// "Mint" in src/lib/colors.ts.
const MINT = '#B5E5CF';

test('a tag colour colours every task that carries the tag', async ({ page }, info) => {
  await signIn(page, uniqueSub(info));
  await addTask(page, 'Fix tap #house');
  await addTask(page, 'Buy milk');
  await expect(row(page, 'Fix tap')).toBeVisible();
  await expect(row(page, 'Buy milk')).toBeVisible();

  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Tag colours' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tag colours' });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('group', { name: 'Colour for #house' })
    .getByRole('button', { name: 'Mint' })
    .click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  const colored = row(page, 'Fix tap').locator('[data-row-color]').first();
  await expect(colored).toHaveAttribute('data-row-color', MINT);
  await expect(row(page, 'Buy milk').locator('[data-row-color]')).toHaveCount(0);
});
