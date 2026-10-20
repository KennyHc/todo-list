import { expect, test, type Page } from '@playwright/test';
import { addTask, check, row, signIn, uniqueSub } from './helpers';

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
