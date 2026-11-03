import { expect, test, type Locator, type Page } from '@playwright/test';
import { addTask, check, signIn, titleBtn, uniqueSub } from './helpers';

/** This week's Monday, Tuesday, Wednesday and today, and next week's Tuesday, by the browser's clock. */
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
    return {
      today: iso(now),
      mon: at(0),
      tue: at(1),
      wed: at(2),
      nextMon: at(7),
      nextTue: at(8),
    };
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

/** Drags `source` onto `target`: by its grip with the mouse, or a long press on touch (CDP). */
async function dragTo(page: Page, source: Locator, target: Locator, touch: boolean) {
  const to = await target.boundingBox();
  if (!to) throw new Error('no drop target');
  const end = { x: to.x + to.width / 2, y: to.y + Math.min(to.height / 2, 40) };
  if (!touch) {
    await source.hover();
    const grip = source.getByRole('button', { name: /^Move / });
    const box = (await grip.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 10; i += 1) {
      await page.mouse.move(box.x + ((end.x - box.x) * i) / 10, box.y + ((end.y - box.y) * i) / 10);
    }
    await page.mouse.up();
    return;
  }
  const from = (await source.boundingBox())!;
  const start = { x: from.x + from.width * 0.5, y: from.y + from.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
    });
  await send('touchStart', start.x, start.y);
  // Hold past the long-press delay (350ms) without moving, so it lifts instead of scrolling.
  await page.waitForTimeout(500);
  for (let i = 1; i <= 10; i += 1) {
    await send(
      'touchMove',
      start.x + ((end.x - start.x) * i) / 10,
      start.y + ((end.y - start.y) * i) / 10,
    );
  }
  await send('touchEnd', end.x, end.y);
  await cdp.detach();
}

test('dragging a task to another day moves its due date, with Undo', async ({ page }, info) => {
  await signIn(page, uniqueSub(info));
  const { mon, tue, wed } = await dates(page);
  const target = info.project.name === 'mobile-chromium' ? tue : wed;

  await addTask(page, 'Drag me !2');
  await expect(titleBtn(page, 'Drag me')).toBeVisible();
  await page.evaluate((d) => window.__e2e!.setDueDate('Drag me', d), mon);
  await page.getByRole('radio', { name: 'Week' }).click();
  const source = day(page, mon).locator('li', { has: titleBtn(page, 'Drag me') });
  await expect(source).toBeVisible();

  await dragTo(page, source, day(page, target), info.project.name === 'mobile-chromium');

  await expect(
    day(page, target).getByRole('button', { name: 'Drag me', exact: true }),
  ).toBeVisible();
  await expect(day(page, mon).getByRole('button', { name: 'Drag me', exact: true })).toHaveCount(0);
  await expect(day(page, target)).toContainText('2 pts');
  await expect(page.getByText(/Moved “Drag me” to /)).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(day(page, mon).getByRole('button', { name: 'Drag me', exact: true })).toBeVisible();
  await expect(day(page, target).getByRole('button', { name: 'Drag me', exact: true })).toHaveCount(
    0,
  );
});
