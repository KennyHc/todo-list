import { expect, test } from '@playwright/test';
import { addTask, ready, row, signIn, uniqueSub } from './helpers';

test('a task added on one device shows up on another, and survives a reload', async ({
  browser,
}, info) => {
  const sub = uniqueSub(info);
  const options = info.project.use;
  const a = await browser.newContext(options);
  const b = await browser.newContext(options);
  try {
    const pageA = await a.newPage();
    const pageB = await b.newPage();
    await signIn(pageA, sub);
    await signIn(pageB, sub);

    await addTask(pageA, 'Call the dentist');
    await expect(row(pageA, 'Call the dentist')).toBeVisible();
    await expect(row(pageB, 'Call the dentist')).toBeVisible({ timeout: 5_000 });

    await pageA.reload();
    await ready(pageA);
    await expect(row(pageA, 'Call the dentist')).toBeVisible();
  } finally {
    await a.close();
    await b.close();
  }
});
