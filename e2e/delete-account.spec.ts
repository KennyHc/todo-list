import { expect, test } from '@playwright/test';
import { addTask, row, signIn, uniqueSub } from './helpers';

test('deleting the account returns to the landing page with a notice', async ({ page }, info) => {
  await signIn(page, uniqueSub(info));
  await addTask(page, 'Soon gone');
  await expect(row(page, 'Soon gone')).toBeVisible();

  // Re-authentication is stubbed by the hook; everything else is the real flow.
  await page.evaluate(() => window.__e2e!.deleteAccount());

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Your account and data were deleted.')).toBeVisible();
});
