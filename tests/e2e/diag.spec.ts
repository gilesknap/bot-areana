import { mkdirSync, writeFileSync } from 'node:fs';
import { test, type Page } from '@playwright/test';

// TEMPORARY diagnostics: where does the main thread stall while Python preloads?
test.skip(!process.env.DIAG, 'diagnostics only');

const LAG = () => {
  const w = window as unknown as { __lag: { t: number; gap: number }[]; __lt: { t: number; d: number; n: string }[] };
  w.__lag = [];
  w.__lt = [];
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    if (now - last > 100) w.__lag.push({ t: Math.round(last), gap: Math.round(now - last) });
    last = now;
  }, 20);
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        const a = (e as unknown as { attribution?: { containerSrc?: string; name?: string }[] }).attribution?.[0];
        w.__lt.push({ t: Math.round(e.startTime), d: Math.round(e.duration), n: `${a?.name ?? ''} ${a?.containerSrc ?? ''}` });
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    // no longtask support
  }
};

async function report(page: Page, label: string) {
  const data = await page.evaluate(() => {
    const w = window as unknown as { __lag: unknown; __lt: unknown };
    const res = performance
      .getEntriesByType('resource')
      .filter((e) => /pyodide|phaser|codeArena|worker/.test(e.name))
      .map((e) => ({ n: e.name.split('/').pop(), s: Math.round(e.startTime), e: Math.round((e as PerformanceResourceTiming).responseEnd) }));
    const gl = document.createElement('canvas').getContext('webgl');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'n/a';
    return { renderer, lag: w.__lag, lt: w.__lt, res };
  });
  console.log(`DIAG ${label} ${JSON.stringify(data)}`);
}

async function traced(page: Page, name: string, body: () => Promise<void>) {
  const browser = page.context().browser()!;
  mkdirSync('diag-out', { recursive: true });
  await browser.startTracing(page, {
    path: `diag-out/${name}.json`,
    categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8', 'v8.execute', 'blink', 'toplevel', 'disabled-by-default-v8.compile', 'loading', 'gpu', 'disabled-by-default-devtools.timeline.frame', 'cc', 'viz', 'disabled-by-default-gpu.service'],
  });
  try {
    await body();
  } finally {
    await browser.stopTracing();
  }
}

test('A: campaign while Python preloads, then code screen once ready', async ({ page }) => {
  await page.addInitScript(LAG);
  await traced(page, 'A', async () => {
    const t0 = Date.now();
    await page.goto('./');
    await page.getByRole('button', { name: /^Level 1: First Steps/ }).waitFor();
    const clicks: number[] = [];
    for (let i = 0; i < 12; i++) {
      const s = Date.now();
      await page.getByRole('button', { name: i % 2 ? /^Level 1: First Steps/ : /^Level 2/ }).click();
      clicks.push(Date.now() - s);
      await page.waitForTimeout(1000);
    }
    console.log(`DIAG A clicks ${JSON.stringify(clicks)} total ${Date.now() - t0}`);
    await report(page, 'A-campaign');
  });
  await traced(page, 'B', async () => {
    const s = Date.now();
    await page.goto('./#/level/l01/code');
    await page.locator('.cm-content').waitFor();
    console.log(`DIAG B code screen visible in ${Date.now() - s} ms`);
    await page.waitForTimeout(5000);
    await report(page, 'B-code-after-ready');
  });
});

test('C: straight to the code screen while Python boots', async ({ page }) => {
  await page.addInitScript(LAG);
  await traced(page, 'C', async () => {
    const s = Date.now();
    await page.goto('./#/level/l01/code');
    await page.locator('.cm-content').waitFor();
    console.log(`DIAG C code screen visible in ${Date.now() - s} ms`);
    await page.waitForTimeout(12000);
    await report(page, 'C-code-booting');
  });
});

test('D: campaign only, no Python (worker blocked)', async ({ page }) => {
  await page.route(/pyodide/, (r) => r.abort());
  await page.addInitScript(LAG);
  await page.goto('./');
  await page.getByRole('button', { name: /^Level 1: First Steps/ }).waitFor();
  await page.waitForTimeout(3000);
  const s = Date.now();
  await page.goto('./#/level/l01/code');
  await page.locator('.cm-content').waitFor();
  console.log(`DIAG D code screen visible in ${Date.now() - s} ms`);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await traced(page, 'D', () => page.waitForTimeout(4000));
  const { profile } = await cdp.send('Profiler.stop');
  writeFileSync('diag-out/D.cpuprofile', JSON.stringify(profile));
  await page.waitForTimeout(1000);
  await report(page, 'D-no-python');
  writeFileSync('diag-out/D.done', '');
});
