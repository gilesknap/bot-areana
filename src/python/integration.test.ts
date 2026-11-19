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

  it('ends the match when the script ends and nothing else can happen', async () => {
    const r = await runMatchHeadless(level, design, 'bot.drive.forward(50, wait=False)');
    expect(r.result).toMatchObject({ won: false, reason: 'script_ended' });
    // The bot finished its move first.
    expect(r.result.seconds).toBeGreaterThan(0.3);
    expect(r.result.seconds).toBeLessThan(5);
  });

  it('idles to the time limit when enemies could still act, and says so', async () => {
    const withEnemy = makeLevel({ ...level, enemies: [{ id: 'e1', design, behaviour: 'static', spawn: { x: 100, y: 1000, heading: 0 } }] });
    const r = await runMatchHeadless(withEnemy, design, 'bot.wait(1)');
    expect(r.result).toMatchObject({ won: false, reason: 'time_up' });
    expect(r.result.seconds).toBeGreaterThanOrEqual(30);
    expect(r.prints.at(-1)).toMatch(/script has finished/);
  });

  it('a failing call still costs a tick, so a retry loop lets time run out', async () => {
    const blaster: BotDesign = { chassis: 'chassis_m', drive: 'wheels', slots: { front: 'blaster' } };
    const script = 'while True:\n    try:\n        bot.blaster.fire()\n    except BotError:\n        pass\n';
    const r = await runMatchHeadless(level, blaster, script, level.seed, { watchdogMs: 1000 });
    expect(r.error).toBeUndefined();
    expect(r.result.reason).toBe('time_up');
  });

  it('script errors end the match with the error line', async () => {
    const r = await runMatchHeadless(level, design, 'bot.wait(0.5)\nbot.drive.forward(bot.front_sensor.distance() / 0)');
    expect(r.error).toMatchObject({ type: 'ZeroDivisionError', line: 2 });
    expect(r.result.reason).toBe('script_error');
  });
});
