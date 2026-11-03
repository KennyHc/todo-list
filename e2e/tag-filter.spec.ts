import { expect, test, type Page } from '@playwright/test';
import { addTask, signIn, titleBtn, uniqueSub } from './helpers';

// MAX_TAG_LENGTH (24) characters: the longest tag the app keeps.
const TAG = 'work-in-progress-longtag';
const filterBtn = (page: Page) => page.getByRole('button', { name: 'Filter', exact: true });
const banner = (page: Page) => page.getByRole('status').filter({ hasText: 'Filtered by' });

/** Filter's right edge sits inside the toolbar's content box, and the page has no sideways scroll. */
async function expectToolbarFits(page: Page) {
  const box = await filterBtn(page).evaluate((el) => {
    const bar = el.closest('[data-intro="3"]')!;
    const cs = getComputedStyle(bar);
    return {
      filterRight: el.getBoundingClientRect().right,
      barRight: bar.getBoundingClientRect().right - parseFloat(cs.paddingRight),
      scroll: document.documentElement.scrollWidth,
      width: window.innerWidth,
    };
  });
  expect(box.filterRight).toBeLessThanOrEqual(box.barRight + 0.5);
  expect(box.scroll).toBeLessThanOrEqual(box.width);
}

test('an active tag filter shows a readable chip, fits every width, and clears', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'resizes the viewport itself');
  await signIn(page, uniqueSub(info));

  // Five labelled views make the widest toolbar.
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('switch', { name: 'Today view' }).click();
  await page.keyboard.press('Escape');

  await addTask(page, `Write report #${TAG}`);
  await addTask(page, 'Buy milk');
  await expect(titleBtn(page, 'Buy milk')).toBeVisible();

  await filterBtn(page).click();
  await page
    .getByRole('dialog', { name: 'Filter by tag' })
    .getByRole('button', { name: new RegExp(`#${TAG}`) })
    .click();
  await expect(titleBtn(page, 'Buy milk')).toBeHidden();

  for (const width of [375, 481, 520, 540, 600, 640, 720, 721, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(banner(page).getByText(`#${TAG}`)).toBeVisible();
    await expectToolbarFits(page);
  }

  await banner(page).getByRole('button', { name: 'Clear' }).click();
  await expect(banner(page)).toHaveCount(0);
  await expect(titleBtn(page, 'Buy milk')).toBeVisible();
});
