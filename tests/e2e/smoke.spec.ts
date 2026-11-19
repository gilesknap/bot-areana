import { readFileSync, mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Smoke: campaign -> Workshop (fit wheels) -> Code & Arena -> run level 1 at 4x -> victory -> level 2 opens.
// SCREENSHOTS=1 also saves a picture of each screen to docs/screenshots/.

const SOLUTION = readFileSync(new URL('../../src/levels/solutions/l01.py', import.meta.url), 'utf8');
const SHOTS = process.env.SCREENSHOTS ? 'docs/screenshots' : null;

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test('build a bot, run level 1, see victory', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('./');
  await expect(page.getByText('BOT ARENA').first()).toBeVisible();
  await page.getByRole('button', { name: /^Level 1: First Steps/ }).click();
  await expect(page.getByRole('complementary', { name: 'Mission briefing' })).toBeVisible();
  await shot(page, 'campaign');

  // Workshop: take the default wheels off, then fit them again from the parts bin.
  await page.getByRole('link', { name: 'Build your bot →' }).click();
  await page.getByRole('button', { name: /^Drive train: Wheels/ }).click();
  await expect(page.getByRole('button', { name: 'Drive train: empty' })).toBeVisible();
  await page.locator('button.part[data-part="wheels"]').click();
  await page.getByRole('button', { name: 'Drive train: empty' }).click();
  await expect(page.getByRole('button', { name: /^Drive train: Wheels/ })).toBeVisible();
  await shot(page, 'workshop');

  // Code & Arena: replace the starter with the reference solution.
  await page.getByRole('link', { name: 'Write the code →' }).click();
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(SOLUTION);
  await expect(editor).toContainText('bot.drive.forward(400)');
  await expect(page.getByText('Python is ready', { exact: false })).toBeVisible({ timeout: 90_000 });
  await shot(page, 'code-arena');

  await page.getByRole('group', { name: 'Playback speed' }).getByRole('button', { name: '4×' }).click();
  await page.getByRole('button', { name: 'Run' }).click();
  const victory = page.getByRole('dialog', { name: 'Victory' });
  await expect(victory).toBeVisible({ timeout: 60_000 });
  await expect(victory).toContainText('MISSION COMPLETE');
  await shot(page, 'victory');

  // Progress saved: level 2 is now open on the campaign.
  await victory.getByRole('link', { name: 'Next level →' }).click();
  await expect(page.getByRole('button', { name: /^Level 1: First Steps, cleared/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Level 2: .*, next/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Build your bot →' })).toBeVisible();

  expect(errors).toEqual([]);
});
