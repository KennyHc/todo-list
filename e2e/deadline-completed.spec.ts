import { expect, test } from '@playwright/test';
import { addTask, check, row, signIn, uniqueSub } from './helpers';

test('completing in By deadline files the task under Completed; unchecking reopens it', async ({
  page,
}, info) => {
  await signIn(page, uniqueSub(info));
  await addTask(page, 'Pay the invoice tomorrow');
  await addTask(page, 'Water plants');
  await page.getByRole('radio', { name: 'By deadline' }).click();
  await expect(page.getByText('Tomorrow', { exact: true }).first()).toBeVisible();

  await check(page, 'Pay the invoice').click();
  // It moves (it is not removed): still on the page, now under Completed.
  await expect(page.getByRole('button', { name: /^Completed · 1$/ })).toBeVisible();
  await expect(check(page, 'Pay the invoice')).toHaveAttribute('aria-checked', 'true');
  await expect(row(page, 'Pay the invoice')).toBeVisible();
  await expect(check(page, 'Water plants')).toHaveAttribute('aria-checked', 'false');

  // Reopen it: back in its date section, and the Completed section is gone.
  await check(page, 'Pay the invoice').click();
  await expect(check(page, 'Pay the invoice')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('button', { name: /^Completed/ })).toHaveCount(0);
  await expect(page.getByText('Tomorrow', { exact: true }).first()).toBeVisible();
});
