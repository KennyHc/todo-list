import { expect, test } from '@playwright/test';

test('the landing page renders the headline, the sign-in button and the demo', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Google' }).first()).toBeVisible();
  await expect(page.getByRole('group', { name: 'Interactive demo' })).toBeVisible();
});
