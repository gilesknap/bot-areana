/**
 * The worker's JavaScript lockdown, against real Pyodide. Runs in its own process (vitest forks
 * per file), since sealing globals can't be undone.
 */
import { loadPyodide, type PyodideAPI } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Frame } from '../shared/frames';
import { createMatch } from '../sim';
import { makeLevel } from '../sim/testkit';
import { lockDownGlobals } from './lockdown';
import { executeRun, prepareRuntime } from './runtime';

let py: PyodideAPI;
const level = makeLevel({ timeLimit: 2 });

function run(script: string): { prints: string[]; error?: string } {
  const frames: Frame[] = [];
  const outcome = executeRun(py, createMatch, { level, design: { chassis: 'chassis_m', drive: 'wheels', slots: {} }, script, seed: 1 }, {
    onFrames: (f) => frames.push(...f),
    watchdogMs: 3000,
  });
  const prints = frames.flatMap((f) => f.events.flatMap((e) => (e.type === 'print' ? [e.text] : [])));
  return { prints, error: outcome.error?.message };
}

beforeAll(async () => {
  py = await loadPyodide();
  prepareRuntime(py);
  lockDownGlobals(globalThis);
});

describe('worker lockdown', () => {
  it('still runs ordinary scripts', () => {
    const r = run('import math, random\nbot.wait(0.1)\nprint(math.floor(2.5), {1, 2})');
    expect(r.error).toBeUndefined();
    expect(r.prints[0]).toBe('2 {1, 2}');
  });

  it('JavaScript reached from Python cannot compile code or use the network', () => {
    const script = `
import sys, gc
bridge = sys._getframe().f_back.f_locals['bridge']
for attempt in (lambda: bridge.constructor("return globalThis")(),
                lambda: bridge.constructor.constructor("return globalThis")()):
    try:
        print("escaped", attempt())
    except Exception as e:
        print("blocked", type(e).__name__)
found = [o for o in gc.get_objects() if type(o).__name__.startswith('JsProxy') and hasattr(o, 'setTimeout')]
for g in found:
    print("global", [getattr(g, n, None) for n in ('fetch', 'eval', 'Function', 'postMessage')])
print("done")
`;
    const r = run(script);
    expect(r.prints.filter((p) => p.startsWith('escaped'))).toEqual([]);
    expect(r.prints).toContain('done');
    expect((globalThis as Record<string, unknown>).fetch).toBeUndefined();
  });
});
