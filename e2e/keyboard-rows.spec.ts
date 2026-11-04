import { expect, test } from '@playwright/test';
import { addTask, composer, row, signIn, uniqueSub } from './helpers';

test('rows are one Tab stop each, with arrow keys between and into them', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'mobile-chromium', 'keyboard flow');
  await signIn(page, uniqueSub(info));
  await addTask(page, 'Alpha');
  await addTask(page, 'Bravo');
  await expect(row(page, 'Bravo')).toBeVisible();

  const tree = page.getByRole('tree', { name: 'Tasks' });
  const alpha = tree.getByRole('treeitem', { name: 'Alpha' });
  const bravo = tree.getByRole('treeitem', { name: 'Bravo' });

  // Tabbing on from the composer reaches the first row, and the next Tab leaves the list.
  const inTree = () => page.evaluate(() => !!document.activeElement?.closest('[role="tree"]'));
  await composer(page).focus();
  for (let i = 0; i < 10 && !(await inTree()); i++) await page.keyboard.press('Tab');
  await expect(alpha).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await inTree()).toBe(false);

  // Back in with Shift+Tab, ↓ moves the row focus; Space completes the focused row.
  await page.keyboard.press('Shift+Tab');
  await expect(alpha).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(bravo).toBeFocused();

  // → steps into the row's buttons, Enter works there, Esc goes back to the row.
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Reorder Bravo' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('checkbox', { name: 'Done: Bravo' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(bravo.getByRole('button', { name: 'Bravo', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Task title' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(bravo).toBeFocused();

  await page.keyboard.press('ArrowUp');
  await expect(alpha).toBeFocused();
  await page.keyboard.press('x');
  await expect(row(page, 'Alpha')).toHaveCount(0);
  await expect(bravo).toBeFocused();
});

for (const key of ['Enter', 'Space'] as const) {
  test(`completing with the checkbox (${key}) keeps focus in the list, and undo brings it back (#66)`, async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'mobile-chromium', 'keyboard flow');
    await signIn(page, uniqueSub(info));
    await addTask(page, 'Alpha');
    await addTask(page, 'Bravo');
    await addTask(page, 'Charlie');
    await expect(row(page, 'Charlie')).toBeVisible();

    const tree = page.getByRole('tree', { name: 'Tasks' });
    const item = (name: string) => tree.getByRole('treeitem', { name });
    await item('Bravo').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const checkbox = page.getByRole('checkbox', { name: 'Done: Bravo' });
    await expect(checkbox).toBeFocused();

    await page.keyboard.press(key);
    await expect(row(page, 'Bravo')).toHaveCount(0);
    await expect(item('Charlie')).toBeFocused();

    await page.keyboard.press('ControlOrMeta+z');
    await expect(item('Bravo')).toBeFocused();

    // The last row hands focus back to the one before it.
    await item('Charlie').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press(key);
    await expect(row(page, 'Charlie')).toHaveCount(0);
    await expect(item('Bravo')).toBeFocused();
  });
}
