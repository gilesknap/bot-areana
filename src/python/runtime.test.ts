import { describe, expect, it } from 'vitest';
import type { BotDesign } from '../shared/parts';
import { runHeadless, type HeadlessOptions } from './headless';
import { testDesign, testLevel, testSim } from './testSim';

// bootstrap.py's cap on lines recorded between two bot calls.
const MAX_LINES_PER_CALL = 100;

const run = (script: string, design: BotDesign = testDesign, options: HeadlessOptions = {}) =>
  runHeadless({ level: testLevel(), design, script, seed: 7 }, { createMatch: testSim.createMatch, ...options });

describe('python runtime (real Pyodide, test sim)', () => {
  it('API calls step the sim and return values', async () => {
    const r = await run('moved = bot.drive.forward(50)\nprint(moved)\nprint(bot.gps.position() if hasattr(bot, "gps") else "no gps")');
    expect(r.error).toBeUndefined();
    expect(testSim.lastMatch!.calls[0]).toEqual(['drive', 'forward', [50, true]]);
    expect(r.prints).toEqual(['50.0', 'no gps']);
    // 50 cm at 10 cm/tick: frames for ticks 0..5 at least, one per tick, in order.
    expect(r.frames.slice(0, 6).map((f) => f.tick)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('applies Python defaults and converts return types', async () => {
    const design: BotDesign = { chassis: 'chassis_l', drive: 'wheels', slots: { centre: 'radar', rear: 'gps' } };
    const r = await run(
      [
        'bot.drive.forward(10, wait=False)',
        'pos = bot.gps.position()',
        'print(type(pos).__name__, pos)',
        't = bot.radar.scan()[0]',
        'print(t.kind, t.bearing, t.distance)',
        'print(t)',
      ].join('\n'),
      design,
    );
    expect(r.error).toBeUndefined();
    expect(testSim.lastMatch!.calls[0]).toEqual(['drive', 'forward', [10, false]]);
    expect(r.prints[0]).toMatch(/^tuple \(\d+\.\d+, 100\.0\)$/);
    expect(r.prints[1]).toBe('turret 45.0 200.0');
    expect(r.prints[2]).toBe("ScanResult(kind='turret', bearing=45.0, distance=200.0, x=250.0, y=50.0)");
  });

  it('sends sys.stdout, print(end=...) and help() to the console', async () => {
    const r = await run('import sys\nprint("a", end="")\nprint("b")\nsys.stdout.write("via stdout\\n")\nprint("no newline", end="")');
    expect(r.error).toBeUndefined();
    expect(r.prints).toEqual(['ab', 'via stdout', 'no newline']);
    const h = await run('help(bot.drive.forward)');
    expect(h.error).toBeUndefined();
    expect(h.prints.join('\n')).toMatch(/forward\(/);
  });

  it('captures print and bot.log with the tick they happened at', async () => {
    const r = await run('print("a", 1, sep="-")\nbot.wait(1)\nbot.log("b", 2)');
    const prints = r.frames.flatMap((f) => f.events.filter((e) => e.type === 'print').map((e) => ({ tick: f.tick, e })));
    expect(prints.map((p) => p.e)).toEqual([
      { type: 'print', text: 'a-1', stream: 'stdout' },
      { type: 'print', text: 'b 2', stream: 'log' },
    ]);
    expect(prints[1]!.tick - prints[0]!.tick).toBe(30);
  });

  it('when the script finishes early the bot idles until the match ends', async () => {
    const r = await run('bot.wait(0.5)');
    expect(r.error).toBeUndefined();
    expect(r.result.reason).toBe('time_up');
    expect(r.result.ticks).toBe(300);
    expect(r.frames.at(-1)!.tick).toBe(300);
  });

  it('a match that ends mid-script stops the script quietly, even past except Exception', async () => {
    const r = await run('while True:\n    try:\n        bot.drive.forward(30)\n    except Exception:\n        print("caught")\n');
    expect(r.error).toBeUndefined();
    expect(r.result.won).toBe(true);
    expect(r.prints).toEqual([]);
  });

  it('a bare except cannot keep a finished match running', async () => {
    const r = await run('while True:\n    try:\n        bot.drive.forward(30)\n    except:\n        pass\n', testDesign, { watchdogMs: 0 });
    expect(r.error).toBeUndefined();
    expect(r.result.won).toBe(true);
  });

  it('seeds random from the run seed', async () => {
    const a = await run('import random\nprint(random.random())');
    const b = await run('import random\nprint(random.random())');
    expect(a.prints).toEqual(b.prints);
  });

  it('records each line of main.py as it starts, with its tick', async () => {
    const r = await run('x = 3\nbot.wait(1)\ndef f():\n    return x + 1\ny = f()\nbot.wait(1)\nprint(y)');
    expect(r.error).toBeUndefined();
    expect(r.lines.map((l) => [l.tick, l.line])).toEqual([[0, 1], [0, 2], [30, 3], [30, 5], [30, 4], [30, 6], [60, 7]]);
  });

  it('keeps the first lines of a loop that never calls the bot, then the call', async () => {
    const r = await run('for i in range(1000):\n    x = i\nbot.wait(1)\nprint(x)');
    const atStart = r.lines.filter((l) => l.tick === 0);
    expect(atStart).toHaveLength(MAX_LINES_PER_CALL);
    expect(atStart.at(-1)!.line).toBe(3);
    expect(r.lines.at(-1)).toEqual({ tick: 30, line: 4 });
  });

  it('ends on the line that raised, even past the cap', async () => {
    const r = await run('for i in range(200):\n    a = i\n    b = 10 / (150 - i)');
    expect(r.error?.line).toBe(3);
    expect(r.lines).toHaveLength(MAX_LINES_PER_CALL);
    expect(r.lines.at(-1)).toEqual({ tick: 0, line: 3 });
  });

  it('records the line that raised', async () => {
    const r = await run('bot.wait(0.1)\nprint(1 / 0)');
    expect(r.error?.line).toBe(2);
    expect(r.lines.at(-1)).toEqual({ tick: 3, line: 2 });
  });

  it('caps runaway printing within one tick', async () => {
    const r = await run('for i in range(1000):\n    print(i)');
    expect(r.prints.length).toBe(201);
    expect(r.prints.at(-1)).toMatch(/too much output/);
  });
});

describe('error mapping', () => {
  it('runtime errors carry the line in main.py and a friendly explanation', async () => {
    const r = await run('bot.wait(0.1)\n\nprint(speed)\n');
    expect(r.error).toMatchObject({ type: 'NameError', line: 3, message: "name 'speed' is not defined" });
    expect(r.error!.friendly).toMatch(/doesn't know the name 'speed'/);
    expect(r.error!.tick).toBe(3);
    expect(r.result.reason).toBe('script_error');
  });

  it('NameError for lowercase true', async () => {
    const r = await run('while true:\n    bot.wait(1)');
    expect(r.error).toMatchObject({ type: 'NameError', line: 1 });
    expect(r.error!.friendly).toMatch(/True, with a capital/);
  });

  it('SyntaxError: missing colon', async () => {
    const r = await run('bot.wait(1)\nwhile True\n    bot.wait(1)');
    expect(r.error).toMatchObject({ type: 'SyntaxError', line: 2, tick: 0 });
    expect(r.error!.friendly).toMatch(/colon/);
    // Nothing ran, so the sim never advanced.
    expect(testSim.lastMatch!.calls).toEqual([]);
  });

  it('IndentationError', async () => {
    const r = await run('while True:\nbot.wait(1)');
    expect(r.error).toMatchObject({ type: 'IndentationError', line: 2 });
    expect(r.error!.friendly).toMatch(/indented/);
  });

  it('TypeError on missing and extra arguments names the bot method', async () => {
    const missing = await run('bot.drive.forward()');
    expect(missing.error).toMatchObject({ type: 'TypeError', line: 1 });
    expect(missing.error!.message).toMatch(/^bot\.drive\.forward\(\) missing 1 required positional argument: 'distance'/);
    expect(missing.error!.friendly).toMatch(/bot\.drive\.forward\(\) needs more information/);

    const extra = await run('bot.front_sensor.distance(5)');
    expect(extra.error!.friendly).toBe('bot.front_sensor.distance() takes no values but you gave it 1.');
  });

  it('TypeError on a wrong argument type', async () => {
    const r = await run('bot.drive.forward("100")');
    expect(r.error).toMatchObject({ type: 'TypeError', line: 1 });
    expect(r.error!.friendly).toMatch(/needs a number for distance.*without quotes/);
  });

  it('a method used without brackets', async () => {
    const r = await run('if bot.front_sensor.distance < 50:\n    pass');
    expect(r.error!.friendly).toMatch(/without calling it/);
  });

  it('game errors raise the named exception, catchable as BotError', async () => {
    const r = await run('bot.blaster.fire()\ntry:\n    bot.blaster.fire()\nexcept BotError as e:\n    print(type(e).__name__, e)\nbot.blaster.fire()');
    expect(r.prints).toEqual(['BlasterNotReady the blaster is still cooling down.']);
    expect(r.error).toMatchObject({ type: 'BlasterNotReady', line: 6 });
    expect(r.error!.tip).toMatch(/ready\(\)/);
  });

  it('errors inside functions point at the line in main.py', async () => {
    const r = await run('def go():\n    return 1 / 0\n\ngo()');
    expect(r.error).toMatchObject({ type: 'ZeroDivisionError', line: 2 });
  });
});

describe('missing parts', () => {
  it('names the missing part and points to the Workshop', async () => {
    const r = await run('bot.radar.scan()');
    expect(r.error).toMatchObject({ type: 'PartNotFitted', line: 1 });
    expect(r.error!.message).toBe('your bot has no radar fitted - add one in the Workshop.');
    expect(r.error!.friendly).toMatch(/^Your bot has no radar fitted/);
  });

  it('mentions sensors fitted elsewhere', async () => {
    const r = await run('bot.left_sensor.distance()');
    expect(r.error!.message).toBe(
      'your bot has no rangefinder in the left slot fitted (you have: bot.front_sensor) - add one in the Workshop.',
    );
  });

  it('only fitted parts exist on bot', async () => {
    const r = await run('print(hasattr(bot, "drive"), hasattr(bot, "gps"), hasattr(bot, "front_sensor"))');
    expect(r.prints).toEqual(['True False True']);
  });

  it('suggests a close match for typos', async () => {
    const r = await run('bot.drive.foward(10)');
    expect(r.error).toMatchObject({ type: 'AttributeError' });
    expect(r.error!.message).toMatch(/bot\.drive has no 'foward'\. Did you mean 'forward'\?/);
  });

  it('a bot with no drive', async () => {
    const r = await run('bot.drive.forward(10)', { chassis: 'chassis_s', drive: null, slots: {} });
    expect(r.error!.message).toMatch(/no drive train fitted/);
  });
});

describe('sandbox', () => {
  for (const mod of ['js', 'pyodide', 'pyodide.http', 'pyodide_js', 'micropip', 'socket', 'urllib.request', 'http.client', 'subprocess']) {
    it(`blocks import ${mod}`, async () => {
      const r = await run(`import ${mod}`);
      expect(r.error).toMatchObject({ type: 'ModuleNotFoundError', line: 1 });
      expect(r.error!.friendly).toMatch(/not available in Bot Arena/);
    });
  }

  it('blocks imports smuggled through another module', async () => {
    const r = await run('import random\nrandom.__builtins__["__import__"]("js")');
    expect(r.error).toMatchObject({ type: 'ModuleNotFoundError' });
    const r2 = await run('import importlib\nimportlib.import_module("pyodide")');
    expect(r2.error).toMatchObject({ type: 'ModuleNotFoundError' });
  });

  it('keeps js out of reach even if the import hook is removed', async () => {
    const r = await run('import sys, builtins\nsys.meta_path.pop(0)\nbuiltins.__import__("js")');
    expect(r.error).toMatchObject({ type: 'ModuleNotFoundError' });
    const r2 = await run('import _pyodide_core');
    expect(r2.error).toMatchObject({ type: 'ModuleNotFoundError' });
  });

  it("undoes a script's changes to shared modules before the next run", async () => {
    const r = await run('import json, sys\njson.dumps = None\nsys.meta_path.clear()\nprint("patched")');
    expect(r.prints).toEqual(['patched']);
    const r2 = await run('import json, importlib\nprint(json.dumps([1]))\nimportlib.import_module("js")');
    expect(r2.prints).toEqual(['[1]']);
    expect(r2.error).toMatchObject({ type: 'ModuleNotFoundError' });
  });

  it('uses a fixed hash seed, so set order is the same every page load', async () => {
    const r = await run('print(hash("abc"))');
    // The value for PYTHONHASHSEED=0.
    expect(r.prints).toEqual(['-1600925533']);
  });

  it('allows ordinary modules', async () => {
    const r = await run('import math, random\nprint(math.floor(2.5))');
    expect(r.error).toBeUndefined();
    expect(r.prints).toEqual(['2']);
  });

  it('input() explains itself', async () => {
    const r = await run('x = input("speed?")');
    expect(r.error!.friendly).toMatch(/cannot stop and ask/);
  });

  it('each run gets a fresh namespace', async () => {
    await run('secret = 42');
    const r = await run('print(secret)');
    expect(r.error).toMatchObject({ type: 'NameError' });
  });
});

describe('headless watchdog', () => {
  it('stops a loop that never calls the bot, keeping frames so far', async () => {
    const r = await run('bot.wait(1)\nwhile True:\n    x = 1\n', testDesign, { watchdogMs: 300 });
    expect(r.error).toMatchObject({ type: 'Watchdog', tick: 30 });
    expect([2, 3]).toContain(r.error!.line);
    expect(r.error!.friendly).toMatch(/thinking too hard/);
    expect(r.result.reason).toBe('watchdog');
    expect(r.frames.length).toBeGreaterThan(30);
  });
});
