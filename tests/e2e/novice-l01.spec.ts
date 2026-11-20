import { expect, test } from '@playwright/test';
import { setCode, shot, watchBrowser } from './helpers';

// Level 1 as a novice meets it: brief, starter, a failed first run, the hints one at a time,
// then the fix. Screenshots (novice-l01-*) are for reading the flow in the CI artifacts.

test('level 1: brief, starter, hints, then a win', async ({ page }) => {
  const errors = watchBrowser(page);

  await page.goto('./');
  await page.getByRole('button', { name: /^Level 1: First Steps/ }).click();
  const brief = page.getByRole('complementary', { name: 'Mission briefing' });
  await expect(brief).toContainText('400 cm dead ahead');
  await shot(page, 'novice-l01-1-brief');

  await page.goto('./#/level/l01/code');
  await expect(page.locator('.cm-content')).toContainText('bot.drive.forward(100)');
  await expect(page.getByText('Python is ready', { exact: false })).toBeVisible({ timeout: 90_000 });
  await page.getByRole('group', { name: 'Playback speed' }).getByRole('button', { name: '4×' }).click();
  await shot(page, 'novice-l01-2-starter');

  // Run the starter unchanged: it stops short of the flag.
  await page.getByRole('button', { name: 'Run' }).click();
  const defeat = page.getByRole('dialog', { name: 'Defeat' });
  await expect(defeat).toBeVisible({ timeout: 60_000 });
  await expect(defeat).toContainText('finished before the objectives were complete');
  await shot(page, 'novice-l01-3-starter-defeat');
  await defeat.getByRole('button', { name: 'Edit & retry' }).click();

  // Reveal the hints one at a time.
  for (let n = 1; n <= 3; n++) {
    await page.getByRole('button', { name: `Hint ${n} of 3` }).click();
    await expect(page.locator('.hint-panel')).toContainText(`HINT ${n}`);
    await shot(page, `novice-l01-4-hint-${n}`);
  }
  await expect(page.getByRole('button', { name: 'Hints 3/3' })).toBeVisible();

  await setCode(page, 'bot.drive.forward(400)\n');
  await page.getByRole('button', { name: 'Run' }).click();
  const victory = page.getByRole('dialog', { name: 'Victory' });
  await expect(victory).toBeVisible({ timeout: 60_000 });
  await expect(victory.getByLabel('3 of 3 stars')).toBeVisible();
  await shot(page, 'novice-l01-5-victory');

  expect(errors).toEqual([]);
});
