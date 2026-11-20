import { test } from '@playwright/test';
import { PYODIDE_CDN } from '../../src/python/version';

// Throwaway spike for docs/bot-vs-bot.md: what does each browser's module worker support?
const WORKER = (cdn: string) => `
const out = { suspending: typeof WebAssembly.Suspending, promising: typeof WebAssembly.promising,
  sab: typeof SharedArrayBuffer, coi: self.crossOriginIsolated };
try {
  const { loadPyodide } = await import('${cdn}pyodide.mjs');
  const py = await loadPyodide({ indexURL: '${cdn}' });
  out.pyodide = py.version;
  out.canRunSyncTop = py.runPython('from pyodide.ffi import can_run_sync\\nstr(can_run_sync())');
  out.canRunSyncAsync = await py.runPythonAsync('from pyodide.ffi import can_run_sync\\nstr(can_run_sync())');
  // Two scripts in one interpreter, interleaved in lockstep by a JS scheduler.
  let tick = 0; const waiting = new Map();
  self.botCall = (bot, what) => new Promise((res) => waiting.set(bot, () => res(bot + ':' + what + '@' + tick)));
  py.runPython("from pyodide.ffi import run_sync\\nimport js\\ndef make_bot(name):\\n    class Bot:\\n        def forward(self, d):\\n            return run_sync(js.botCall(name, 'fwd%d' % d))\\n    return Bot()\\n");
  const script = (n) => "bot = make_bot('" + n + "')\\ndef h(k):\\n    return bot.forward(1) if k == 0 else h(k - 1)\\n[h(20) for i in range(3)]\\n";
  const ns = () => { const d = py.globals.get('dict')(); d.set('make_bot', py.globals.get('make_bot')); return d; };
  if (out.canRunSyncAsync === 'True') {
    const pA = py.runPythonAsync(script('A'), { globals: ns() });
    const pB = py.runPythonAsync(script('B'), { globals: ns() });
    let done = 0; pA.then(() => done++); pB.then(() => done++);
    for (let g = 0; g < 100 && done < 2; g++) {
      await new Promise((r) => setTimeout(r, 0));
      if (waiting.size < 2 - done) continue;
      tick++; const rel = [...waiting.values()]; waiting.clear(); rel.forEach((f) => f());
    }
    out.A = (await pA).toJs(); out.B = (await pB).toJs();
    self.asyncCall = (x) => Promise.resolve(x + 1);
    const t = performance.now();
    await py.runPythonAsync('import js\\nfrom pyodide.ffi import run_sync\\nx=0\\nfor i in range(5000): x = run_sync(js.asyncCall(x))');
    out.usPerSuspend = Math.round(((performance.now() - t) / 5000) * 1000);
  }
} catch (e) { out.error = String(e && e.message || e).slice(0, 400); }
postMessage(out);
`;

test('jspi spike', async ({ page, browserName }) => {
  test.setTimeout(120_000);
  await page.goto('./');
  const out = await page.evaluate(async (src) => {
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url, { type: 'module' });
    return await new Promise((res) => { w.onmessage = (e) => res(e.data); w.onerror = (e) => res({ workerError: String(e.message) }); });
  }, WORKER(PYODIDE_CDN));
  const filter = await page.evaluate(() => typeof (document.createElement('canvas').getContext('2d') as unknown as { filter?: unknown }).filter);
  console.log(`SPIKE ${browserName} ctx.filter=${filter} ${await page.evaluate(() => navigator.userAgent)} ${JSON.stringify(out)}`);
});
