import { expect, test, type Page } from '@playwright/test';
import { addTask, ready, signIn, titleBtn, uniqueSub } from './helpers';

const N = 2000;

/** Whether leaving now would ask the user to stay (what a reload or tab close would show). */
const unloadBlocked = (page: Page) =>
  page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });

const taskCount = (page: Page) =>
  page.evaluate(async () => {
    const { useTaskStore } = (await import(
      /* @vite-ignore */ `${location.origin}/src/store/tasks.ts`
    )) as { useTaskStore: { getState: () => { tasks: object } } };
    return Object.keys(useTaskStore.getState().tasks).length;
  });

test('a large restore says "Saving", holds the page while it uploads, and survives a reload (#61)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'one browser is enough for a sync test');
  test.setTimeout(120_000);
  await signIn(page, uniqueSub(info));
  await addTask(page, 'Before the restore');
  await expect(titleBtn(page, 'Before the restore')).toBeVisible();
  // A small edit that the server has confirmed does not hold the page.
  await expect.poll(() => unloadBlocked(page)).toBe(false);

  await page.evaluate((n) => window.__e2e!.restoreTasks(n), N);
  expect(await unloadBlocked(page)).toBe(true);

  const main = page.locator('main');
  await expect(main).toHaveAttribute('data-saving', 'true', { timeout: 10_000 });
  await page.getByRole('button', { name: /^Account, Saving [\d,]+ changes…$/ }).click();
  await expect(page.getByRole('menu', { name: 'Account' })).toContainText(/Saving [\d,]+ changes…/);
  await page.keyboard.press('Escape');

  // Once the server has everything, leaving is free again and a reload keeps every task.
  await expect(main).not.toHaveAttribute('data-saving', /.*/, { timeout: 90_000 });
  expect(await unloadBlocked(page)).toBe(false);
  await page.reload();
  await ready(page);
  await expect.poll(() => taskCount(page), { timeout: 15_000 }).toBe(N);
});
