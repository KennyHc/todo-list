import { expect, test, type Locator, type Page } from '@playwright/test';
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

/** At least 44×44, give or take the 0.5px sampling step. Soft, so one run lists every gap. */
async function expectFingerSized(name: string, target: Locator) {
  await expect(target, name).toBeVisible();
  const { width, height } = await hitArea(target);
  expect.soft(width, `${name}: hit area width`).toBeGreaterThanOrEqual(43.5);
  expect.soft(height, `${name}: hit area height`).toBeGreaterThanOrEqual(43.5);
}

const yesterday = (page: Page) =>
  page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

for (const width of [375, 320]) {
  test.describe(`phone touch targets at ${width}px (#26, #65)`, () => {
    test.beforeEach(async ({ page }, info) => {
      test.skip(info.project.name !== 'mobile-chromium', 'touch hit areas');
      await page.setViewportSize({ width, height: 812 });
      await signIn(page, uniqueSub(info));
    });

    test('header, overdue line and row controls', async ({ page }) => {
      await addTask(page, 'Write report #work !3');
      await expect(titleBtn(page, 'Write report')).toBeVisible();
      const due = await yesterday(page);
      await page.evaluate((d) => window.__e2e!.setDueDate('Write report', d), due);
      await page.evaluate(() => window.__e2e!.setNotes('Write report', 'Outline first'));
      // By id: once the title is tapped the title button gives way to the editor.
      const id = await row(page, 'Write report').getAttribute('data-row-id');
      const li = page.locator(`li[data-row-id="${id}"]`);

      await expectFingerSized('Search', page.getByRole('button', { name: 'Search', exact: true }));
      await expectFingerSized('Move to today', page.getByRole('button', { name: 'Move to today' }));
      await expectFingerSized('difficulty', li.getByRole('button', { name: /— change$/ }).first());
      await expectFingerSized('tag', li.getByRole('button', { name: 'Filter by tag work' }));
      // Neighbours of the controls above keep theirs too.
      await expectFingerSized('checkbox', li.getByRole('checkbox').first());
      await expectFingerSized('note', li.getByRole('button', { name: 'Show note' }));

      await titleBtn(page, 'Write report').click();
      await expectFingerSized('editor ⋯', li.getByRole('button', { name: 'More options' }));
    });

    test('the Week view "+" on a day', async ({ page }) => {
      // The view switch only shows once there is a task.
      await addTask(page, 'Plan the week');
      await page.getByRole('radio', { name: 'Week' }).click();
      await expect(page.locator('section[data-date]')).toHaveCount(7);
      await expectFingerSized(
        'Week +',
        page.getByRole('button', { name: /^Add a task on / }).first(),
      );
    });
  });
}
