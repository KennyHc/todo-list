import { expect, test, type Page } from '@playwright/test';
import { signIn, uniqueSub } from './helpers';

/** ISO dates by the browser's clock: today and this week's Monday. */
const dates = (page: Page) =>
  page.evaluate(() => {
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const now = new Date();
    const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
    return { today: iso(now), mon: iso(mon) };
  });

/** Adds `count` tasks due on `date` in one go, through the app's store (Vite serves it). */
const seed = (page: Page, prefix: string, count: number, date: string) =>
  page.evaluate(
    async ([p, n, d]) => {
      const { useTaskStore } = (await import(
        /* @vite-ignore */ `${location.origin}/src/store/tasks.ts`
      )) as { useTaskStore: { getState: () => { add: (t: object) => string } } };
      for (let i = 0; i < n; i++) useTaskStore.getState().add({ title: `${p} ${i}`, dueDate: d });
    },
    [prefix, count, date] as const,
  );

const headOf = (page: Page, date: string) => page.locator(`section[data-date="${date}"] header`);
const topOf = async (page: Page, date: string) => (await headOf(page, date).boundingBox())!.y;
/** Where the phone's sticky chrome ends: the bottom of the view row. */
const chromeBottom = (page: Page) =>
  page.evaluate(() => {
    const value = getComputedStyle(document.querySelector('main')!).getPropertyValue('--sticky-2');
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute;height:${value}`;
    document.body.append(probe);
    const px = probe.getBoundingClientRect().height;
    probe.remove();
    return px;
  });

test('phone Week opens at today with its header pinned under the bars (#67)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile-chromium', 'stacked phone layout');
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, uniqueSub(info));
  const { today, mon } = await dates(page);
  test.skip(today === mon, 'on a Monday the week already opens at today');

  // Enough on Monday to push today well below the first screen, and a few rows today.
  await seed(page, 'Early', 14, mon);
  await seed(page, 'Today', 8, today);

  await page.getByRole('radio', { name: 'Week' }).click();
  await expect(page.locator('section[data-date]')).toHaveCount(7);
  const bar = await chromeBottom(page);
  await expect.poll(() => topOf(page, today)).toBeLessThanOrEqual(bar + 2);
  expect(await topOf(page, today)).toBeGreaterThanOrEqual(bar - 2);

  // Scrolling through today's rows keeps its header pinned, and nothing covers it.
  await page.mouse.wheel(0, 200);
  await expect.poll(() => topOf(page, today)).toBeCloseTo(bar, 0);
  const box = (await headOf(page, today).boundingBox())!;
  const onTop = await page.evaluate(
    ([x, y]) => !!document.elementFromPoint(x, y)?.closest('section header'),
    [box.x + 4, box.y + box.height / 2] as const,
  );
  expect(onTop).toBe(true);

  // Back at the top of the page, Monday comes first as before.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => topOf(page, mon)).toBeGreaterThan(bar);
});

test('stacked days on a tablet open at today too; seven columns stay put (#67)', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'one browser is enough');
  await page.setViewportSize({ width: 800, height: 700 });
  await signIn(page, uniqueSub(info));
  const { today, mon } = await dates(page);
  test.skip(today === mon, 'on a Monday the week already opens at today');
  await seed(page, 'Early', 20, mon);
  await seed(page, 'Today', 12, today);
  await page.getByRole('radio', { name: 'Week' }).click();
  await expect(page.locator('section[data-date]')).toHaveCount(7);
  // Near the top (16px, give or take the day card's own padding settling in).
  await expect.poll(() => topOf(page, today)).toBeLessThanOrEqual(24);
  expect(await topOf(page, today)).toBeGreaterThanOrEqual(0);

  // At 1280 the week is seven columns: opening it does not scroll.
  await page.getByRole('radio', { name: 'Tree' }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('radio', { name: 'Week' }).click();
  await expect(page.locator('section[data-date]')).toHaveCount(7);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
