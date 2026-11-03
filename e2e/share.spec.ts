import { expect, test } from '@playwright/test';
import { composer, ready, row, uniqueSub } from './helpers';

test('opening a share link prefills the composer; Enter adds the row with a link chip', async ({
  page,
}, info) => {
  const sub = uniqueSub(info);
  await page.goto('/?text=Read%20this&url=https://example.com/article');
  await page.waitForFunction(() => window.__e2e !== undefined);
  await page.evaluate((s) => window.__e2e!.signIn(s), sub);
  await ready(page);

  const input = composer(page);
  await expect(input).toHaveValue('Read this https://example.com/article');
  await expect(input).toBeFocused();
  // The address bar is cleaned, and nothing was added by the link alone.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('li[data-row-id]')).toHaveCount(0);

  await input.press('Enter');
  const created = row(page, 'Read this');
  await expect(created).toBeVisible();
  const chip = created.getByRole('link', { name: 'example.com' });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute('href', 'https://example.com/article');
  await expect(chip).toHaveAttribute('target', '_blank');
  await expect(created).not.toContainText('article');
});

test('?add= shows the parsed chips before confirming', async ({ page }, info) => {
  await page.goto('/?add=Pay%20rent%20tomorrow%20%23home');
  await page.waitForFunction(() => window.__e2e !== undefined);
  await page.evaluate((s) => window.__e2e!.signIn(s), uniqueSub(info));
  await ready(page);

  await expect(composer(page)).toHaveValue('Pay rent tomorrow #home');
  const chips = page.getByRole('list', { name: 'Recognised in this task' });
  await expect(chips.getByText('Tomorrow', { exact: true })).toBeVisible();
  await expect(chips.getByText('home')).toBeVisible();
  await expect(page.locator('li[data-row-id]')).toHaveCount(0);
});

test('text from a link opened while signed out survives sign-in', async ({ page }, info) => {
  await page.goto('/?add=Call%20mum');
  await page.waitForFunction(() => window.__e2e !== undefined);
  // The landing page is showing; the text waits in the session.
  await expect(page).toHaveURL(/\/$/);
  await page.evaluate((s) => window.__e2e!.signIn(s), uniqueSub(info));
  await ready(page);
  await expect(composer(page)).toHaveValue('Call mum');
});
