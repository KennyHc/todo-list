import { expect, test, type Page } from '@playwright/test';
import { addTask, check, signIn, titleBtn, uniqueSub } from './helpers';

/** This week's Monday, Wednesday and today, and next week's Tuesday, by the browser's clock. */
const dates = (page: Page) =>
  page.evaluate(() => {
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const now = new Date();
    const at = (offset: number) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset);
      return iso(d);
    };
    return { today: iso(now), mon: at(0), wed: at(2), nextMon: at(7), nextTue: at(8) };
  });

const day = (page: Page, date: string) => page.locator(`section[data-date="${date}"]`);
const nav = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Week' }).getByRole('button', { name, exact: true });

test('tasks land on their due days, and the week moves forward and back', async ({
  page,
}, info) => {
  await signIn(page, uniqueSub(info));
  const { today, mon, wed, nextMon, nextTue } = await dates(page);

  await addTask(page, 'Week start !2');
  await addTask(page, 'Midweek !3');
  await addTask(page, 'Planning call !1');
  await expect(titleBtn(page, 'Planning call')).toBeVisible();
  await page.evaluate((d) => window.__e2e!.setDueDate('Week start', d), mon);
  await page.evaluate((d) => window.__e2e!.setDueDate('Midweek', d), wed);
  await page.evaluate((d) => window.__e2e!.setDueDate('Planning call', d), nextTue);

  await page.getByRole('radio', { name: 'Week' }).click();
  await expect(page.locator('section[data-date]')).toHaveCount(7);
  await expect(page.locator('section[data-date]').first()).toHaveAttribute('data-date', mon);
  await expect(day(page, today)).toHaveAttribute('aria-current', 'date');

  await expect(
    day(page, mon).getByRole('button', { name: 'Week start', exact: true }),
  ).toBeVisible();
  await expect(day(page, mon)).toContainText('2 pts');
  await expect(day(page, wed).getByRole('button', { name: 'Midweek', exact: true })).toBeVisible();
  await expect(day(page, wed)).toContainText('3 pts');
  await expect(titleBtn(page, 'Planning call')).toHaveCount(0);

  // The days stack on a phone without pushing the page sideways.
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);

  // Checking a task off keeps it on its day, struck through, with Undo.
  await check(page, 'Midweek').click();
  await expect(check(page, 'Midweek')).toHaveAttribute('aria-checked', 'true');
  await expect(day(page, wed).getByRole('button', { name: 'Midweek', exact: true })).toBeVisible();
  await expect(day(page, wed)).toContainText('0 pts');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(check(page, 'Midweek')).toHaveAttribute('aria-checked', 'false');

  await nav(page, 'Next week').click();
  await expect(page.locator('section[data-date]').first()).toHaveAttribute('data-date', nextMon);
  await expect(
    day(page, nextTue).getByRole('button', { name: 'Planning call', exact: true }),
  ).toBeVisible();
  await expect(titleBtn(page, 'Week start')).toHaveCount(0);
  await expect(page.locator('section[aria-current="date"]')).toHaveCount(0);

  await nav(page, 'Today').click();
  await expect(page.locator('section[data-date]').first()).toHaveAttribute('data-date', mon);
  await expect(
    day(page, mon).getByRole('button', { name: 'Week start', exact: true }),
  ).toBeVisible();
});

test('the command palette goes to Week', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'keyboard flow');
  await signIn(page, uniqueSub(info));
  await addTask(page, 'Anything');
  await expect(titleBtn(page, 'Anything')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('combobox', { name: 'Search tasks and commands' }).fill('week');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('radio', { name: 'Week' })).toHaveAttribute('aria-checked', 'true');
});
