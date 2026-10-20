import { expect, test } from '@playwright/test';
import { composer, row, signIn, uniqueSub } from './helpers';

test('quick add turns typed shorthand into chips, then into a task', async ({ page }, info) => {
  await signIn(page, uniqueSub(info));
  await composer(page).fill('Pay rent tomorrow #home !2');

  const chips = page.getByRole('list', { name: 'Recognised in this task' });
  await expect(chips.getByText('Tomorrow', { exact: true })).toBeVisible();
  await expect(chips.getByText('2', { exact: true })).toBeVisible();
  await expect(chips.getByText('home')).toBeVisible();

  await composer(page).press('Enter');
  const created = row(page, 'Pay rent');
  await expect(created).toBeVisible();
  await expect(created.getByText('Tomorrow', { exact: true })).toBeVisible();
  await expect(created.getByRole('button', { name: 'Filter by tag home' })).toBeVisible();
});
