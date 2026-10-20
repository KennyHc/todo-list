import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

/** A fresh Firebase user id per test, so tests never see each other's data. */
export const uniqueSub = (info: TestInfo) =>
  `e2e-${info.project.name}-${info.workerIndex}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Opens the app, signs in through the Auth emulator and waits until sync has settled. */
export async function signIn(page: Page, sub: string): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__e2e !== undefined);
  await page.evaluate((s) => window.__e2e!.signIn(s), sub);
  await ready(page);
}

/** The app is mounted, the first sync finished and the composer is usable. */
export async function ready(page: Page): Promise<void> {
  await expect(page.locator('main[data-sync="ready"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('combobox', { name: 'New task' })).toBeVisible();
}

export const composer = (page: Page) => page.getByRole('combobox', { name: 'New task' });

/** Types into the composer and presses Enter. */
export async function addTask(page: Page, text: string): Promise<void> {
  const input = composer(page);
  await input.click();
  await input.fill(text);
  await input.press('Enter');
}

/** The title button of the row with exactly this title. */
export const titleBtn = (page: Page, title: string) =>
  page.getByRole('button', { name: title, exact: true });

/** That row's own <li> (not an ancestor's, which also contains it). */
export const row = (page: Page, title: string) =>
  titleBtn(page, title).first().locator('xpath=ancestor::li[@data-row-id][1]');

/** The row's checkbox. */
export const check = (page: Page, title: string) =>
  page.getByRole('checkbox', { name: `Done: ${title}`, exact: true });

/**
 * Opens a row's ⋯ "More options" menu (a sheet on phones). Phone rows carry no ⋯ of their own:
 * tapping the title opens the inline editor, whose trailing ⋯ opens the sheet.
 */
export async function openMenu(page: Page, title: string) {
  const id = await row(page, title).getAttribute('data-row-id');
  const li = page.locator(`li[data-row-id="${id}"]`);
  const more = li.getByRole('button', { name: 'More options' }).first();
  if ((await more.count()) === 0) {
    await titleBtn(page, title).first().click();
    await li.getByRole('button', { name: 'More options' }).click();
  } else {
    await more.click();
  }
  const menu = page.getByRole('dialog', { name: 'Task options' });
  await expect(menu).toBeVisible();
  return menu;
}

/** A horizontal one-finger swipe across `target`, sent as real touch events through CDP. */
export async function swipe(page: Page, target: Locator, dx: number): Promise<void> {
  const box = await target.boundingBox();
  if (!box) throw new Error('nothing to swipe');
  const y = box.y + box.height / 2;
  // Start well inside the row, clear of the check on the left and the buttons on the right.
  const startX = box.x + box.width * (dx > 0 ? 0.4 : 0.6);
  const cdp = await page.context().newCDPSession(page);
  const send = (type: string, x: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
    });
  await send('touchStart', startX);
  const steps = 10;
  for (let i = 1; i <= steps; i += 1) await send('touchMove', startX + (dx * i) / steps);
  await send('touchEnd', startX + dx);
  await cdp.detach();
}
