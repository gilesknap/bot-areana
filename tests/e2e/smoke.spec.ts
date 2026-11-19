import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { setCode, shot, watchBrowser } from './helpers';

// Smoke: campaign -> Workshop (fit wheels) -> Code & Arena -> run level 1 at 4x -> victory -> level 2 opens.

const SOLUTION = readFileSync(new URL('../../src/levels/solutions/l01.py', import.meta.url), 'utf8');

test('build a bot, run level 1, see victory', async ({ page }) => {
  const errors = watchBrowser(page);

  await page.goto('./');
  await expect(page.getByText('BOT ARENA').first()).toBeVisible();
  await page.getByRole('button', { name: /^Level 1: First Steps/ }).click();
  await expect(page.getByRole('complementary', { name: 'Mission briefing' })).toBeVisible();
  await shot(page, '1-campaign');

  // Workshop: take the default wheels off, then fit them again from the parts bin. The drive
  // train's outline wraps the centre slot, so click its label rather than the middle of it.
  await page.getByRole('link', { name: 'Build your bot →' }).click();
  await page.getByRole('button', { name: /^Drive train: Wheels/ }).locator('.bp-part-name').click();
  await expect(page.getByRole('button', { name: 'Drive train: empty' })).toBeVisible();
  await page.locator('button.part[data-part="wheels"]').click();
  await page.getByRole('button', { name: 'Drive train: empty' }).locator('.bp-part-name').click();
  await expect(page.getByRole('button', { name: /^Drive train: Wheels/ })).toBeVisible();
  await shot(page, '2-workshop');

  // Code & Arena: replace the starter with the reference solution.
  await page.getByRole('link', { name: 'Write the code →' }).click();
  await setCode(page, SOLUTION);
  await expect(page.getByText('Python is ready', { exact: false })).toBeVisible({ timeout: 90_000 });
  await shot(page, '3-code-arena');

  await page.getByRole('group', { name: 'Playback speed' }).getByRole('button', { name: '4×' }).click();
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.waitForTimeout(700);
  await shot(page, '4-playback');

  const victory = page.getByRole('dialog', { name: 'Victory' });
  await expect(victory).toBeVisible({ timeout: 60_000 });
  await expect(victory).toContainText('MISSION COMPLETE');
  await shot(page, '5-victory');

  // Progress saved: level 2 is now open on the campaign.
  await victory.getByRole('link', { name: 'Next level →' }).click();
  await expect(page.getByRole('button', { name: /^Level 1: First Steps, cleared/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Level 2: .*, next/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Build your bot →' })).toBeVisible();
  await shot(page, '6-campaign-after');

  expect(errors).toEqual([]);
});
