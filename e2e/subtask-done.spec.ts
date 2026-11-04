import { expect, type Page, test } from '@playwright/test';
import { addTask, check, openMenu, row, signIn, swipe, titleBtn, uniqueSub } from './helpers';

// #74: checking one subtask must leave its parent open while other subtasks are open, whatever
// the input, also when the parent row was selected first and a key follows the check.

async function addSubtask(page: Page, parent: string, title: string, typed = title) {
  const menu = await openMenu(page, parent);
  await menu.getByRole('button', { name: 'Add subtask' }).click();
  const editor = page.getByRole('textbox', { name: 'Task title' });
  await expect(editor).toBeFocused();
  await page.keyboard.type(typed);
  await page.keyboard.press('Enter');
  await expect(titleBtn(page, title)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  // The closing menu stays in the DOM while it animates out, and hotkeys wait for dialogs.
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
}

/** Parent with three subtasks; `typed` adds quick-add text (a due date) to each title. */
async function seed(page: Page, typed = '') {
  await addTask(page, `Parent${typed}`);
  await expect(titleBtn(page, 'Parent')).toBeVisible();
  for (const child of ['One', 'Two', 'Three']) {
    await addSubtask(page, 'Parent', child, `${child}${typed}`);
  }
}

/** Selects a row the way a click on its blank space does. */
async function select(page: Page, title: string) {
  const target = row(page, title).locator('[data-row]').first();
  await target.evaluate((el: HTMLElement) => el.click());
  // The selected row (Week only moves the DOM focus from nowhere or from another row).
  await expect(target).toHaveAttribute('data-focused', 'true');
}

const isOpen = (page: Page, title: string) =>
  expect(check(page, title)).toHaveAttribute('aria-checked', 'false');

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'keyboard and mouse');

  for (const key of ['x', ' ']) {
    test(`click a subtask's checkbox with the parent selected, then ${key === ' ' ? 'Space' : key}`, async ({
      page,
    }, info) => {
      await signIn(page, uniqueSub(info));
      await seed(page);
      await select(page, 'Parent');
      await check(page, 'One').click();
      await expect(row(page, 'One')).toHaveCount(0);
      await isOpen(page, 'Parent');
      // The key acts on the row that took the checked one's place, never on the parent.
      await page.keyboard.press(key);
      await expect(row(page, 'Two')).toHaveCount(0);
      await isOpen(page, 'Parent');
      await isOpen(page, 'Three');
    });
  }

  for (const key of ['x', ' ']) {
    test(`${key === ' ' ? 'Space' : key} on a focused subtask row checks only that subtask`, async ({
      page,
    }, info) => {
      await signIn(page, uniqueSub(info));
      await seed(page);
      await select(page, 'Two');
      await page.keyboard.press(key);
      await expect(row(page, 'Two')).toHaveCount(0);
      await isOpen(page, 'Parent');
      await isOpen(page, 'One');
      await isOpen(page, 'Three');
    });
  }

  test('Week: the checked subtask stays, and x then reopens it', async ({ page }, info) => {
    await signIn(page, uniqueSub(info));
    await seed(page, ' today');
    await page.getByRole('radio', { name: 'Week', exact: true }).click();
    await select(page, 'Parent');
    await check(page, 'One').click();
    await expect(check(page, 'One')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('x');
    await isOpen(page, 'One');
    await isOpen(page, 'Parent');
  });

  test('checking every subtask still completes the parent', async ({ page }, info) => {
    await signIn(page, uniqueSub(info));
    await seed(page);
    await check(page, 'One').click();
    await check(page, 'Two').click();
    await isOpen(page, 'Parent');
    await check(page, 'Three').click();
    await expect(row(page, 'Parent')).toHaveCount(0);
    await expect(page.locator('li[data-row-id]')).toHaveCount(0);
  });
});

test.describe('phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'touch');
  // Then x from a hardware keyboard (an iPad): it must not reach the parent selected before.

  test('tap a subtask checkbox with the parent selected, then x', async ({ page }, info) => {
    await signIn(page, uniqueSub(info));
    await seed(page);
    await select(page, 'Parent');
    await check(page, 'One').tap();
    await expect(row(page, 'One')).toHaveCount(0);
    await isOpen(page, 'Parent');
    await page.keyboard.press('x');
    await expect(row(page, 'Two')).toHaveCount(0);
    await isOpen(page, 'Parent');
    await isOpen(page, 'Three');
  });

  test('swipe a subtask to complete with the parent selected, then x', async ({ page }, info) => {
    await signIn(page, uniqueSub(info));
    await seed(page);
    await select(page, 'Parent');
    await swipe(page, row(page, 'One').locator('[data-row]').first(), 240);
    await expect(row(page, 'One')).toHaveCount(0);
    await isOpen(page, 'Parent');
    await page.keyboard.press('x');
    await expect(row(page, 'Two')).toHaveCount(0);
    await isOpen(page, 'Parent');
    await isOpen(page, 'Three');
  });
});
