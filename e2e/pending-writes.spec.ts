import { expect, test, type Page } from '@playwright/test';
import { addTask, signIn, titleBtn, uniqueSub } from './helpers';

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
  // Rendering 2,000 rows makes a slow CI runner take minutes, not seconds, to upload them.
  test.setTimeout(300_000);
  await signIn(page, uniqueSub(info));
  await addTask(page, 'Before the restore');
  await expect(titleBtn(page, 'Before the restore')).toBeVisible();
  // A small edit that the server has confirmed does not hold the page.
  await expect.poll(() => unloadBlocked(page)).toBe(false);

  await page.evaluate((n) => window.__e2e!.restoreTasks(n), N);
  expect(await unloadBlocked(page)).toBe(true);

  // Cheap reads only: with 2,000 rows on the page an accessibility-tree query can take longer
  // than the upload itself.
  const savingState = () =>
    page.evaluate(() => {
      const label = document
        .querySelector('button[aria-label^="Account"]')
        ?.getAttribute('aria-label');
      return `${label} | ${document.querySelector('main')?.dataset.saving ?? 'no'}`;
    });
  await expect
    .poll(savingState, { timeout: 30_000, intervals: [100] })
    .toMatch(/^Account, Saving [\d,]+ changes… \| true$/);
  const main = page.locator('main');

  // Once the server has everything, leaving is free again and a reload keeps every task.
  await expect(main).not.toHaveAttribute('data-saving', /.*/, { timeout: 240_000 });
  expect(await unloadBlocked(page)).toBe(false);
  await page.reload();
  await expect(page.locator('main[data-sync="ready"]')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => taskCount(page), { timeout: 30_000 }).toBe(N);
});
