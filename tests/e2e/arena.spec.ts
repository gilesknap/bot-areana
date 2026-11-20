import { expect, test, type Page } from '@playwright/test';
import { setCode, shot, watchBrowser } from './helpers';

// Step mode walks the script a line at a time; the arena canvas follows its panel on resize.

/** The TICK shown in the run bar. */
async function shownTick(page: Page): Promise<number> {
  const text = (await page.locator('.readout').textContent()) ?? '';
  return Number(/TICK (\d+)/.exec(text)?.[1]);
}

test('step highlights the current line and moves to the next one', async ({ page }) => {
  const errors = watchBrowser(page);
  await page.goto('./#/level/l01/code');
  await expect(page.getByText('Python is ready', { exact: false })).toBeVisible({ timeout: 90_000 });
  await setCode(page, 'x = 3\nbot.drive.forward(100)\nbot.drive.turn(90)\n');

  const step = page.getByRole('button', { name: 'Step one line' });
  const current = page.locator('.cm-current-line');
  // The first step starts the run paused and lands on line 1 once the worker sends it.
  await step.click();
  await expect(current).toHaveText('x = 3', { timeout: 15_000 });
  const start = await shownTick(page);
  expect(start).toBe(0);

  // `x = 3` takes no game time: the next line is at the same tick.
  await step.click();
  await expect(current).toHaveText('bot.drive.forward(100)');
  expect(await shownTick(page)).toBe(start);
  // The move takes time: stepping to the turn jumps the arena to when the move ended.
  await step.click();
  await expect(current).toHaveText('bot.drive.turn(90)');
  expect(await shownTick(page)).toBeGreaterThan(start + 10);
  await shot(page, 'step-line');

  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(current).toHaveCount(0);
  expect(errors).toEqual([]);
});

/** Canvas size (pixels and CSS box) against the arena panel it lives in. */
function canvasFit(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('.arena-host')!;
    const canvas = host.querySelector('canvas')!;
    const box = canvas.getBoundingClientRect();
    const hostBox = host.getBoundingClientRect();
    return {
      dpr: Math.min(3, window.devicePixelRatio || 1),
      host: [hostBox.left, hostBox.top, hostBox.width, hostBox.height],
      css: [box.left, box.top, box.width, box.height],
      pixels: [canvas.width, canvas.height],
    };
  });
}

for (const deviceScaleFactor of [1, 2]) {
  test.describe(`at devicePixelRatio ${deviceScaleFactor}`, () => {
    test.use({ deviceScaleFactor });

    test('the arena canvas follows its panel when the window is resized', async ({ page }) => {
      const errors = watchBrowser(page);
      await page.goto('./#/level/l01/code');
      await expect(page.locator('.arena-host[data-drawn]')).toBeAttached({ timeout: 15_000 });

      for (const [width, height] of [[1100, 700], [1800, 1100], [1300, 800]] as const) {
        await page.setViewportSize({ width, height });
        // Fills the panel exactly (not clipped, no gap) with dpr pixels per CSS pixel both ways (not stretched).
        await expect
          .poll(async () => {
            const f = await canvasFit(page);
            const fits = f.css.every((v, i) => Math.abs(v - f.host[i]!) <= 1);
            const sharp = f.pixels.every((p, i) => Math.abs(p - f.host[i + 2]! * f.dpr) <= 2);
            return fits && sharp ? 'ok' : JSON.stringify(f);
          })
          .toBe('ok');
      }
      await shot(page, `arena-resized-dpr${deviceScaleFactor}`);
      expect(errors).toEqual([]);
    });
  });
}
