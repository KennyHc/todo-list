import { expect, test, type Page } from '@playwright/test';
import { addTask, check, row, signIn, swipe, uniqueSub } from './helpers';

const entry = (page: Page, title: string) => page.locator('li', { hasText: title });
const history = (page: Page) => page.getByRole('radio', { name: 'History' });
const toast = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });

test('complete, then in History: Edit, delete for good, Undo', async ({ page }, info) => {
  await signIn(page, uniqueSub(info));
  await addTask(page, 'Pay rent');
  await addTask(page, 'Water plants');
  await check(page, 'Pay rent').click();
  // Filed in History: it leaves the Tree, the other task stays.
  await expect(check(page, 'Pay rent')).toHaveCount(0);
  await expect(row(page, 'Water plants')).toBeVisible();

  await history(page).click();
  await expect(entry(page, 'Pay rent')).toBeVisible();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete "Pay rent" permanently' }).click();
  await expect(entry(page, 'Pay rent')).toHaveCount(0);
  await expect(toast(page, 'Deleted “Pay rent”')).toBeVisible();

  await toast(page, 'Deleted “Pay rent”').getByRole('button', { name: 'Undo' }).click();
  await expect(entry(page, 'Pay rent')).toBeVisible();
  // Deleting the last entry left edit mode; Edit and Done toggle it.
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('button', { name: /permanently/ })).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
  await expect(page.getByRole('button', { name: /permanently/ })).toHaveCount(0);
});

test('restoring from History returns the task to the Tree', async ({ page }, info) => {
  await signIn(page, uniqueSub(info));
  await addTask(page, 'Read a book');
  await check(page, 'Read a book').click();
  await expect(check(page, 'Read a book')).toHaveCount(0);

  await history(page).click();
  await check(page, 'Read a book').click();
  await expect(toast(page, 'Restored “Read a book”')).toBeVisible();
  await page.getByRole('radio', { name: 'Tree' }).click();
  await expect(check(page, 'Read a book')).toHaveAttribute('aria-checked', 'false');
});

test('the Restore button brings a task back, and edit mode hides it', async ({ page }, info) => {
  await signIn(page, uniqueSub(info));
  await addTask(page, 'Water the ferns');
  await addTask(page, 'Stay put');
  await check(page, 'Water the ferns').click();
  await expect(check(page, 'Water the ferns')).toHaveCount(0);

  await history(page).click();
  const restore = page.getByRole('button', {
    name: 'Restore \u201cWater the ferns\u201d to your list',
  });
  await expect(restore).toBeVisible();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(restore).toHaveCount(0);
  await page.getByRole('button', { name: 'Done' }).click();

  await restore.click();
  await expect(toast(page, 'Restored \u201cWater the ferns\u201d')).toBeVisible();
  await expect(entry(page, 'Water the ferns')).toHaveCount(0);
  await page.getByRole('radio', { name: 'Tree' }).click();
  await expect(check(page, 'Water the ferns')).toHaveAttribute('aria-checked', 'false');
});

test('swiping a History row right restores it (touch only)', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile-chromium', 'a touch gesture');
  await signIn(page, uniqueSub(info));
  await addTask(page, 'Swipe me back');
  await check(page, 'Swipe me back').click();
  await expect(check(page, 'Swipe me back')).toHaveCount(0);

  await history(page).click();
  const item = entry(page, 'Swipe me back');
  // The button is always there on touch.
  await expect(item.getByRole('button', { name: /^Restore/ })).toBeVisible();
  // Swiping left does nothing outside edit mode.
  await swipe(page, item, -200);
  await expect(item).toBeVisible();
  await swipe(page, item, 240);
  await expect(toast(page, 'Restored \u201cSwipe me back\u201d')).toBeVisible();
  await expect(item).toHaveCount(0);
});

test('Delete all removes every completed task after a confirmation', async ({ page }, info) => {
  await signIn(page, uniqueSub(info));
  await addTask(page, 'One');
  await addTask(page, 'Two');
  await check(page, 'One').click();
  await check(page, 'Two').click();
  await expect(page.locator('li[data-row-id]')).toHaveCount(0);

  await history(page).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('button', { name: 'Delete all' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('2 completed tasks');
  await dialog.getByRole('button', { name: 'Delete all' }).click();
  // Nothing left at all: the whole app is empty again.
  await expect(page.getByText('All clear')).toBeVisible();
  await expect(toast(page, 'Deleted all completed (2)')).toBeVisible();
});

test('Escape leaves History edit mode', async ({ page }, info) => {
  await signIn(page, uniqueSub(info));
  await addTask(page, 'Quick one');
  await check(page, 'Quick one').click();
  await expect(check(page, 'Quick one')).toHaveCount(0);
  await history(page).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('button', { name: /permanently/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
  await expect(page.getByRole('button', { name: /permanently/ })).toHaveCount(0);
});
