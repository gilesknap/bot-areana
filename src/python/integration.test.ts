/** The Python bridge against the real sim (the default createMatch of runHeadless). */
import { describe, expect, it } from 'vitest';
import type { BotDesign } from '../shared/parts';
import { makeLevel } from '../sim/testkit';
import { runMatchHeadless } from './headless';

const design: BotDesign = { chassis: 'chassis_m', drive: 'wheels', slots: { front: 'rangefinder', rear: 'gps' } };
// Player spawns at the centre (600, 600) facing up; the flag is 200 cm straight ahead.
const level = makeLevel({
  objectives: [{ type: 'reach', id: 'flag', label: 'Reach the flag', target: { x: 600, y: 400 }, radius: 30 }],
  timeLimit: 30,
});

describe('python + real sim', () => {
  it('drives to the flag and wins', async () => {
    const script = 'x, y = bot.gps.position()\nprint(x, y, bot.gps.heading())\nbot.drive.forward(200)\nprint("never")\n';
    const r = await runMatchHeadless(level, design, script);
    expect(r.error).toBeUndefined();
    expect(r.prints[0]).toBe('600.0 600.0 0.0');
    expect(r.result).toMatchObject({ won: true, reason: 'objectives_complete' });
    expect(r.result.stars).toBeGreaterThanOrEqual(1);
    expect(r.frames.map((f) => f.tick)).toEqual(r.frames.map((_, i) => i));
  });

  it('is deterministic for the same seed', async () => {
    const script = 'import random\nbot.drive.turn(random.randint(-90, 90))\nbot.drive.forward(100)\n';
    const a = await runMatchHeadless(level, design, script, 5);
    const b = await runMatchHeadless(level, design, script, 5);
    expect(a.frames).toEqual(b.frames);
  });

  it('idles after the script ends until time runs out', async () => {
    const r = await runMatchHeadless(level, design, 'bot.wait(1)');
    expect(r.result).toMatchObject({ won: false, reason: 'time_up' });
    expect(r.result.seconds).toBeGreaterThanOrEqual(30);
  });

  it('script errors end the match with the error line', async () => {
    const r = await runMatchHeadless(level, design, 'bot.wait(0.5)\nbot.drive.forward(bot.front_sensor.distance() / 0)');
    expect(r.error).toMatchObject({ type: 'ZeroDivisionError', line: 2 });
    expect(r.result.reason).toBe('script_error');
  });
});
