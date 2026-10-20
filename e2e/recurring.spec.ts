import { expect, test } from '@playwright/test';
import { addTask, check, signIn, uniqueSub } from './helpers';

test('completing a repeating task creates the next one', async ({ page }, info) => {
  await signIn(page, uniqueSub(info));
  await addTask(page, 'Water plants every sunday');
  const checkbox = check(page, 'Water plants');
  await expect(checkbox).toBeVisible();

  await checkbox.click();

  // Done copy stays; a fresh unchecked "Water plants" appears with the next due date.
  const toast = page.getByRole('status').filter({ hasText: /next on / });
  await expect(toast).toBeVisible();
  const next = /next on (.+?)\s*Undo/.exec((await toast.innerText()).replace(/\n/g, ' '))?.[1];
  expect(next).toBeTruthy();

  const rows = page.locator('li[data-row-id]').filter({
    has: page.getByRole('button', { name: 'Water plants', exact: true }),
  });
  await expect(rows).toHaveCount(2);
  const fresh = rows.filter({
    has: page.getByRole('checkbox', { name: 'Done: Water plants', checked: false }),
  });
  await expect(fresh).toHaveCount(1);
  const pill = fresh.getByRole('img', { name: /repeats/ });
  await expect(pill).toContainText(next!.trim());
  // The pill's title is the ISO due date, and it falls on a Sunday.
  const iso = /\d{4}-\d{2}-\d{2}/.exec((await pill.getAttribute('title')) ?? '')?.[0];
  expect(new Date(`${iso}T12:00:00`).getDay()).toBe(0);
});
