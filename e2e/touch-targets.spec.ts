import { expect, test, type Locator } from '@playwright/test';
import { addTask, row, signIn, titleBtn, uniqueSub } from './helpers';

/**
 * The finger hit area of a control: from its centre, walk outwards in 0.5px steps while
 * `elementFromPoint` still lands on the control (or a child, or its ::after hit box). The
 * screen edge counts as part of the target, since a finger cannot overshoot it.
 */
const hitArea = (target: Locator) =>
  target.evaluate((el) => {
    const step = 0.5;
    const limit = 60;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const hits = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return true;
      const at = document.elementFromPoint(x, y);
      return !!at && (at === el || el.contains(at));
    };
    const reach = (dx: number, dy: number) => {
      let d = 0;
      while (d < limit && hits(cx + (d + step) * dx, cy + (d + step) * dy)) d += step;
      return d;
    };
    return {
      width: reach(-1, 0) + reach(1, 0) + step,
      height: reach(0, -1) + reach(0, 1) + step,
    };
  });

/** At least 44×44, give or take the 0.5px sampling step. */
async function expectFingerSized(target: Locator) {
  await expect(target).toBeVisible();
  const { width, height } = await hitArea(target);
  expect(width, 'hit area width').toBeGreaterThanOrEqual(43.5);
  expect(height, 'hit area height').toBeGreaterThanOrEqual(43.5);
}

test.describe('phone touch targets at 375px (#26)', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile-chromium', 'touch hit areas');
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, uniqueSub(info));
  });

  test('row controls: difficulty, tag and the editor ⋯', async ({ page }) => {
    await addTask(page, 'Write report #work !3');
    await expect(titleBtn(page, 'Write report')).toBeVisible();
    // By id: once the title is tapped the title button gives way to the editor.
    const id = await row(page, 'Write report').getAttribute('data-row-id');
    const li = page.locator(`li[data-row-id="${id}"]`);

    await expectFingerSized(li.getByRole('button', { name: /— change$/ }).first());
    await expectFingerSized(li.getByRole('button', { name: 'Filter by tag work' }));

    await titleBtn(page, 'Write report').click();
    await expectFingerSized(li.getByRole('button', { name: 'More options' }));
  });

  test('the Week view "+" on a day', async ({ page }) => {
    await page.getByRole('radio', { name: 'Week' }).click();
    await expect(page.locator('section[data-date]')).toHaveCount(7);
    await expectFingerSized(page.getByRole('button', { name: /^Add a task on / }).first());
  });
});
