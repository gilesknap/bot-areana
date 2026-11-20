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
    const t = ((window as unknown as { __t: Record<string, number[]> }).__t = {});
    const wrap = (proto: any, name: string) => {
      const orig = proto[name];
      if (!orig) return;
      proto[name] = function (this: unknown, ...args: unknown[]) {
        const s = performance.now();
        try {
          return orig.apply(this, args);
        } finally {
          const d = performance.now() - s;
          const k = `${name}${name === 'getContext' ? ':' + String(args[0]) : ''}`;
          (t[k] ??= [0, 0, 0]);
          t[k]![0]! += d;
          t[k]![1]! += 1;
          t[k]![2] = Math.max(t[k]![2]!, d);
        }
      };
    };
    for (const n of ['compileShader', 'linkProgram', 'getProgramParameter', 'getShaderParameter', 'texImage2D', 'texSubImage2D', 'readPixels', 'drawElements', 'drawArrays', 'getError'])
      wrap(WebGLRenderingContext.prototype, n);
    for (const n of ['getImageData', 'drawImage', 'putImageData', 'fillText']) wrap(CanvasRenderingContext2D.prototype, n);
    wrap(HTMLCanvasElement.prototype, 'getContext');
    wrap(HTMLImageElement.prototype, 'decode');
  });
  const lag = async (label: string) => {
    const r = await page.evaluate(() => {
      const w = window as unknown as { __lag: number[] };
      const out = w.__lag.slice();
      w.__lag.length = 0;
      const gl = document.createElement('canvas').getContext('webgl');
      const info = gl?.getExtension('WEBGL_debug_renderer_info');
      const tt = (window as unknown as { __t: Record<string, number[]> }).__t;
      const timings = Object.fromEntries(Object.entries(tt).map(([k, v]) => [k, v.map(Math.round)]));
      for (const k in tt) delete tt[k];
      return { timings, renderer: info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'n/a', plain: gl ? String(gl.getParameter(gl.RENDERER)) : 'none', gaps: out };
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
