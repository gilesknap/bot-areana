import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { getLevel, LEVELS } from '../../src/levels';
import { shot, watchBrowser } from './helpers';
import { mockupHtml } from './mockups';

// Game vs mockup: renders the approved mockups (docs/visual) and the matching game screens, and
// plays reference solutions (turrets on level 5, lava on level 8) for arena screenshots.

for (const name of ['Campaign', 'Workshop', 'Arena']) {
  test(`mockup ${name}`, async ({ page }) => {
    await page.setContent(mockupHtml(name), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await shot(page, `mockup-${name.toLowerCase()}`);
    if (name === 'Arena') await page.locator('svg[role="img"]').screenshot({ path: 'test-results/screens/mockup-arena-svg.png' });
  });
}

/** Mark the levels before `levelId` cleared and load its reference design and script. */
async function seedProgress(page: Page, levelId: string): Promise<void> {
  const level = getLevel(levelId)!;
  const before = LEVELS.filter((l) => l.number < level.number).map((l) => l.id);
  const script = readFileSync(new URL(`../../src/levels/${level.solution.script}`, import.meta.url), 'utf8');
  // Let the app create its save, then edit it from a page that doesn't run the app (the app
  // writes its in-memory save back when it is unloaded).
  await page.goto('./');
  await expect(page.getByText('BOT ARENA').first()).toBeVisible();
  await page.goto('./favicon.svg');
  await page.evaluate(
    async ({ before, id, design, script }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open('bot-arena', 1);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      const tx = db.transaction('save', 'readwrite');
      const store = tx.objectStore('save');
      const data = await new Promise<any>((resolve) => {
        const r = store.get('data');
        r.onsuccess = () => resolve(r.result);
      });
      const profile = data.profiles.find((p: { id: string }) => p.id === data.activeProfileId);
      for (const l of before) profile.levels[l] = { cleared: true, bestStars: 3, attempts: 1 };
      profile.designs[id] = design;
      profile.toursSeen = ['workshop', 'code'];
      profile.scripts[id] = script;
      store.put(data, 'data');
      await new Promise((resolve) => (tx.oncomplete = resolve));
    },
    { before, id: level.id, design: level.solution.design, script },
  );
}

for (const [levelId, times] of [
  ['l05', [1200, 3500, 6000, 9000]],
  ['l08', [1500, 4000, 7000]],
] as const) {
  test(`arena playback ${levelId}`, async ({ page }) => {
    const errors = watchBrowser(page);
    await seedProgress(page, levelId);

    await page.goto(`./#/level/${levelId}`);
    await expect(page.getByRole('complementary', { name: 'Mission briefing' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await shot(page, `game-${levelId}-campaign`);
    await page.goto(`./#/level/${levelId}/workshop`);
    await expect(page.getByRole('link', { name: 'Write the code →' })).toBeVisible();
    await shot(page, `game-${levelId}-workshop`);

    await page.goto(`./#/level/${levelId}/code`);
    await expect(page.getByText('Python is ready', { exact: false })).toBeVisible({ timeout: 90_000 });
    await page.getByRole('group', { name: 'Playback speed' }).getByRole('button', { name: '1×' }).click();
    await page.waitForTimeout(500);
    await shot(page, `game-${levelId}-code`);
    await page.getByRole('button', { name: 'Run' }).click();
    const t0 = Date.now();
    for (const t of times) {
      await page.waitForTimeout(Math.max(0, t - (Date.now() - t0)));
      await page.locator('.arena-wrap').screenshot({ path: `test-results/screens/game-${levelId}-arena-${t}.png` });
    }
    await shot(page, `game-${levelId}-playback`);
    expect(errors).toEqual([]);
  });
}

test.describe('HiDPI', () => {
  test.use({ deviceScaleFactor: 2 });
  test('arena is crisp at devicePixelRatio 2', async ({ page }) => {
    const errors = watchBrowser(page);
    await seedProgress(page, 'l05');
    await page.goto('./#/level/l05/code');
    await expect(page.getByText('Python is ready', { exact: false })).toBeVisible({ timeout: 90_000 });
    await page.getByRole('button', { name: 'Run' }).click();
    await page.waitForTimeout(3000);
    await page.locator('.arena-wrap').screenshot({ path: 'test-results/screens/game-l05-arena-hidpi.png' });
    expect(errors).toEqual([]);
  });
});

test('first-run tours, Python status and the API drawer', async ({ page }) => {
  const errors = watchBrowser(page, { keepTours: true });
  await page.goto('./#/level/l01/workshop');
  const tour = page.getByRole('dialog', { name: 'Guided tour' });
  await expect(tour).toBeVisible();
  await shot(page, 'tour-workshop-1');
  for (let i = 1; i < 5; i++) await tour.getByRole('button', { name: 'Next →' }).click();
  await shot(page, 'tour-workshop-5');
  await tour.getByRole('button', { name: 'Got it' }).click();
  await expect(tour).toBeHidden();

  await page.getByRole('link', { name: 'Write the code →' }).click();
  await expect(tour).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'PYTHON' })).toBeVisible();
  await shot(page, 'tour-code-1');
  await tour.getByRole('button', { name: 'Skip tour' }).click();
  await expect(tour).toBeHidden();

  // API reference: click-to-insert an example into the script.
  await page.getByRole('button', { name: 'API' }).click();
  await page.getByRole('button', { name: 'Insert example: bot.drive.turn' }).click();
  await expect(page.locator('.cm-content')).toContainText('bot.drive.turn(90)');
  await shot(page, 'api-drawer');

  // Tours are remembered for the profile.
  await page.reload();
  await expect(page.getByText('Python is ready', { exact: false })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('status').filter({ hasText: 'PYTHON READY' })).toBeVisible();
  await expect(tour).toBeHidden();
  await page.goto('./#/level/l01/workshop');
  await expect(page.getByRole('link', { name: 'Write the code →' })).toBeVisible();
  await expect(tour).toBeHidden();
  expect(errors).toEqual([]);
});
