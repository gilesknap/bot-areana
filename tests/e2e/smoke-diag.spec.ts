import { test } from '@playwright/test';

// TEMPORARY: renderer string and main-thread gaps per browser.
test('DIAG renderer and lag', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __lag: number[] };
    w.__lag = [];
    let last = performance.now();
    setInterval(() => {
      const now = performance.now();
      if (now - last > 100) w.__lag.push(Math.round(now - last));
      last = now;
    }, 20);
  });
  const lag = async (label: string) => {
    const r = await page.evaluate(() => {
      const w = window as unknown as { __lag: number[] };
      const out = w.__lag.slice();
      w.__lag.length = 0;
      const gl = document.createElement('canvas').getContext('webgl');
      const info = gl?.getExtension('WEBGL_debug_renderer_info');
      return { renderer: info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'n/a', plain: gl ? String(gl.getParameter(gl.RENDERER)) : 'none', gaps: out };
    });
    console.log(`DIAG ${test.info().project.name} ${label} ${JSON.stringify(r)}`);
  };
  await page.goto('./');
  await page.waitForTimeout(5000);
  await lag('campaign-booting');
  await page.goto('./#/level/l01/code');
  await page.locator('.cm-content').waitFor();
  await page.waitForTimeout(1000);
  await lag('code-enter');
  await page.waitForTimeout(5000);
  await lag('code-idle');
});
