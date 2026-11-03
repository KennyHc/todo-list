import { expect, test, type Page } from '@playwright/test';
import { addTask, check, openMenu, row, signIn, uniqueSub } from './helpers';

const todaySegment = (page: Page) => page.getByRole('radio', { name: 'Today' });
const meter = (page: Page) => page.getByRole('meter', { name: "Today's load" });

/** Opens the avatar menu, flips the Today view switch and closes the menu. */
async function setTodayView(page: Page, on: boolean) {
  await page.getByRole('button', { name: 'Account' }).click();
  const toggle = page.getByRole('switch', { name: 'Today view' });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-checked', on ? 'false' : 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', on ? 'true' : 'false');
  await page.keyboard.press('Escape');
  await expect(toggle).toBeHidden();
}

test('opt in to Today, plan a task, finish it, and opt out again', async ({ page }, info) => {
  await signIn(page, uniqueSub(info));
  await addTask(page, 'Write report !3');
  await expect(row(page, 'Write report')).toBeVisible();

  // Off by default: no Today segment, nothing about planning in the row menu.
  await expect(todaySegment(page)).toHaveCount(0);

  await setTodayView(page, true);
  await expect(todaySegment(page)).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Nothing planned for today')).toBeVisible();
  await expect(meter(page)).toHaveAttribute('aria-valuetext', '0 of 8 points done, 0 planned');

  // Plan an existing task from the Tree...
  await page.getByRole('radio', { name: 'Tree' }).click();
  const menu = await openMenu(page, 'Write report');
  await menu.getByRole('button', { name: 'Plan for today' }).click();
  await expect(menu).toBeHidden();

  // ...and add another straight into Today, where new tasks are planned for today.
  await todaySegment(page).click();
  await addTask(page, 'Call the bank !2');
  await expect(row(page, 'Write report')).toBeVisible();
  await expect(row(page, 'Call the bank')).toBeVisible();
  await expect(page.getByText('Nothing planned for today')).toHaveCount(0);
  await expect(meter(page)).toHaveAttribute('aria-valuetext', '0 of 8 points done, 5 planned');
  await expect(page.getByText('· 5 planned')).toBeVisible();

  // Finishing a task files it away and raises "done".
  await check(page, 'Write report').click();
  await expect(meter(page)).toHaveAttribute('aria-valuetext', '3 of 8 points done, 2 planned');
  await expect(row(page, 'Write report')).toHaveCount(0);
  await expect(row(page, 'Call the bank')).toBeVisible();

  // Opting out removes the segment and falls back to the Tree.
  await setTodayView(page, false);
  await expect(todaySegment(page)).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Tree' })).toHaveAttribute('aria-checked', 'true');
  await expect(row(page, 'Call the bank')).toBeVisible();
});

test('the setting follows the account to another device', async ({ browser, page }, info) => {
  const sub = uniqueSub(info);
  await signIn(page, sub);
  await addTask(page, 'Anything');
  await setTodayView(page, true);
  // Let the debounced write reach the emulator.
  await expect(page.locator('main[data-sync="ready"]')).toBeVisible();
  await page.waitForTimeout(800);

  const second = await browser.newContext();
  const other = await second.newPage();
  await signIn(other, sub);
  await expect(todaySegment(other)).toBeVisible();
  await second.close();
});
