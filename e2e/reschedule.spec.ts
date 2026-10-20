import { expect, test } from '@playwright/test';
import { addTask, composer, row, signIn, swipe, titleBtn, uniqueSub } from './helpers';

test('desktop: the hover button moves a task to Tomorrow, and Undo puts it back', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'hover flow');
  await signIn(page, uniqueSub(info));
  await addTask(page, 'Pay rent');
  const item = row(page, 'Pay rent');
  await expect(item).toBeVisible();

  await item.hover();
  await item.getByRole('button', { name: 'Reschedule' }).click();
  const menu = page.getByRole('dialog', { name: 'Reschedule' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: /^Tomorrow/ }).click();

  await expect(menu).toBeHidden();
  await expect(item.getByText('Tomorrow', { exact: true })).toBeVisible();
  const toast = page.getByRole('status').filter({ hasText: /Moved .Pay rent. to / });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(item.getByText('Tomorrow', { exact: true })).toHaveCount(0);
});

test('desktop: s on a focused row opens the menu and m picks tomorrow', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'keyboard flow');
  await signIn(page, uniqueSub(info));
  await addTask(page, 'Pay rent');
  const item = row(page, 'Pay rent');
  await expect(item).toBeVisible();

  await composer(page).blur();
  await page.keyboard.press('j');
  await page.keyboard.press('s');
  await expect(page.getByRole('dialog', { name: 'Reschedule' })).toBeVisible();
  await page.keyboard.press('m');
  await expect(item.getByText('Tomorrow', { exact: true })).toBeVisible();
});

test('phone: a partial swipe left reveals Later; Later then Tomorrow reschedules', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile-chromium', 'touch flow');
  await signIn(page, uniqueSub(info));
  await addTask(page, 'Pay rent');
  const item = row(page, 'Pay rent');
  await expect(item).toBeVisible();

  await swipe(page, item, -130);
  const later = page.getByRole('button', { name: 'Later' });
  await expect(later).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
  // Nothing was deleted or completed.
  await expect(titleBtn(page, 'Pay rent')).toBeVisible();

  await later.click();
  const sheet = page.getByRole('dialog', { name: 'Reschedule' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('menuitem', { name: /^Tomorrow/ }).click();

  await expect(sheet).toBeHidden();
  await expect(item.getByText('Tomorrow', { exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /Moved .Pay rent. to / })).toBeVisible();
});

test('phone: a full swipe left still deletes, and tapping away closes the buttons', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile-chromium', 'touch flow');
  await signIn(page, uniqueSub(info));
  await addTask(page, 'Keep me');
  await addTask(page, 'Drop me');
  await expect(row(page, 'Keep me')).toBeVisible();
  await expect(row(page, 'Drop me')).toBeVisible();

  await swipe(page, row(page, 'Keep me'), -130);
  await expect(page.getByRole('button', { name: 'Later' })).toBeVisible();
  await page.getByRole('heading', { name: 'Tasks', level: 1 }).click();
  await expect(page.getByRole('button', { name: 'Later' })).toBeHidden();

  await swipe(page, row(page, 'Drop me'), -300);
  await expect(titleBtn(page, 'Drop me')).toHaveCount(0);
  await expect(titleBtn(page, 'Keep me')).toBeVisible();
});

test('the overdue line moves every overdue task to today in one go', async ({ page }, info) => {
  await signIn(page, uniqueSub(info));
  await addTask(page, 'Late one');
  await addTask(page, 'Late two');
  await addTask(page, 'On time');
  await expect(row(page, 'On time')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move to today' })).toHaveCount(0);

  await page.evaluate(() => window.__e2e!.setDueDate('Late one', '2020-01-02'));
  await page.evaluate(() => window.__e2e!.setDueDate('Late two', '2020-01-03'));
  const line = page.getByRole('status').filter({ hasText: 'Move to today' });
  await expect(line).toContainText('2 overdue');

  await line.getByRole('button', { name: 'Move to today' }).click();
  await expect(page.getByRole('button', { name: 'Move to today' })).toHaveCount(0);
  await expect(row(page, 'Late one').getByText('Today', { exact: true })).toBeVisible();
  await expect(row(page, 'Late two').getByText('Today', { exact: true })).toBeVisible();
  const toast = page.getByRole('status').filter({ hasText: 'Moved 2 overdue tasks to today' });
  await expect(toast).toBeVisible();

  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(line).toContainText('2 overdue');
});
