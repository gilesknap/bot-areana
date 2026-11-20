/**
 * Novice playtest (docs/playtest-v1.md): scripts a beginner plausibly writes from the brief, the
 * starter and the hints, with the outcome each should get. Keeps the difficulty curve honest:
 * hint-guided attempts that use the level's concept win, typical mistakes fail with a clear
 * reason, and shortcuts that skip the concept don't earn 3 stars.
 */
import { describe, expect, it } from 'vitest';
import { runMatchHeadless } from '../python/headless';
import type { BotDesign } from '../shared/parts';
import type { EndReason } from '../shared/result';
import { getLevel } from '.';

const S: BotDesign = { chassis: 'chassis_s', drive: 'wheels', slots: {} };
const S_RANGE: BotDesign = { chassis: 'chassis_s', drive: 'wheels', slots: { front: 'rangefinder' } };
const S_GPS: BotDesign = { chassis: 'chassis_s', drive: 'wheels', slots: { front: 'gps' } };
const S_BUMP: BotDesign = { chassis: 'chassis_s', drive: 'wheels', slots: { front: 'bump' } };
const M_GUNNER: BotDesign = { chassis: 'chassis_m', drive: 'wheels', slots: { front: 'blaster', rear: 'gps', centre: 'battery' } };
const M_RADAR: BotDesign = { chassis: 'chassis_m', drive: 'wheels', slots: { front: 'blaster', rear: 'radar', centre: 'battery' } };
const M_GPS = (drive: 'wheels' | 'tracks'): BotDesign => ({ chassis: 'chassis_m', drive, slots: { front: 'gps' } });
const M_SHIELD: BotDesign = {
  chassis: 'chassis_m',
  drive: 'wheels',
  slots: { front: 'blaster', rear: 'radar', left: 'shield', centre: 'battery_plus' },
};
const L_SHIELD: BotDesign = {
  chassis: 'chassis_l',
  drive: 'wheels',
  slots: { front: 'blaster', rear: 'radar', left: 'shield', right: 'gps', centre: 'battery_plus' },
};

interface Expect {
  won: boolean;
  /** Exact star count, or [min, max]. */
  stars?: number | [number, number];
  reason?: EndReason;
  error?: string;
}

interface Attempt {
  name: string;
  design: BotDesign;
  script: string;
  seed?: number;
  expect: Expect;
}

const starter = (id: string) => getLevel(id)!.starter;
/** Replace a line of the starter (comment or TODO) with the novice's code. */
const fill = (id: string, line: string, code: string) => {
  const s = starter(id);
  if (!s.includes(line)) throw new Error(`${id} starter has no line: ${line}`);
  return s.replace(line, code);
};

const L3_IF = fill('l03', '    # Drive up the lane, then turn right towards the flag.', '    bot.drive.forward(380)\n    bot.drive.turn(90)\n    bot.drive.forward(240)');
const L3_LEFT_ONLY =
  'bot.drive.turn(-90)\nbot.drive.forward(240)\nbot.drive.turn(90)\nbot.drive.forward(380)\nbot.drive.turn(90)\nbot.drive.forward(240)\n';
const l3Both = L3_IF.replace(
  '    # Turn right, cross over to the right lane and go up that one.',
  '    bot.drive.turn(90)\n    bot.drive.forward(480)\n    bot.drive.turn(-90)\n    bot.drive.forward(380)\n    bot.drive.turn(-90)\n    bot.drive.forward(240)',
);

const l5 = (order: string, shoot: string) => `turrets = ${order}
for x, y in turrets:
    bot.drive.turn(bot.gps.bearing_to(x, y))
${shoot}`;
const L5_MIDDLE_LAST = '[(160, 360), (260, 140), (620, 140), (720, 360), (440, 300)]';
const L5_MIDDLE_FIRST = '[(440, 300), (160, 360), (260, 140), (620, 140), (720, 360)]';
const L5_TWO_SHOTS = `    shots = 0
    while shots < 2:
        while not bot.blaster.ready():
            bot.wait(0.1)
        bot.blaster.fire()
        shots = shots + 1
`;

const l6 = (body: string, tail: string) => `def drive_until_bump():
    bot.drive.forward(1000, wait=False)
    while not bot.front_bumper.hit():
        bot.wait(0.1)
${body}
${tail}`;
const L6_LOOP = 'while True:\n    drive_until_bump()\n    bot.drive.turn(90)\n';

const l7 = (inner: string, wait: string) => `while True:
    for thing in bot.radar.scan():
        if thing.kind == "bot":
            bot.drive.turn(thing.bearing)
${inner}
    bot.wait(${wait})
`;
const L7_FIRE = '            if bot.blaster.ready():\n                bot.blaster.fire()';
const L7_CLOSE_IN =
  '            if thing.distance > 300:\n                bot.drive.forward(60)\n            elif bot.blaster.ready():\n                bot.blaster.fire()';

const L8_LOOP = fill(
  'l08',
  '    # TODO: turn to face (x, y) and drive there, like on Patrol Route.',
  '    bot.drive.turn(bot.gps.bearing_to(x, y))\n    bot.drive.forward(bot.gps.distance_to(x, y))',
);

const l9 = (fight: boolean) => `while True:
    near = None
    for thing in bot.radar.scan():
        if thing.kind == "bot":
            near = thing
            break
    if near is not None and near.distance < 350 and bot.battery.level() > 30:
        bot.shield.on()
    else:
        bot.shield.off()
${fight ? '    if near is not None:\n        bot.drive.turn(near.bearing)\n        if bot.blaster.ready():\n            bot.blaster.fire()\n' : ''}    bot.wait(0.5)
`;

const L10_ATTACK = fill(
  'l10',
  '        # TODO: face the target, close in if it is far away, fire when ready.\n',
  `        bot.drive.turn(target.bearing)
        if target.distance > 350:
            bot.drive.forward(target.distance - 300)
        elif bot.blaster.ready():
            bot.blaster.fire()
`,
);
const L10_SHIELD = L10_ATTACK.replace(
  '    def attack(self, target):\n',
  `    def attack(self, target):
        if target.distance < 400 and bot.battery.level() > 15:
            bot.shield.on()
        else:
            bot.shield.off()
`,
);

const ATTEMPTS: Record<string, Attempt[]> = {
  l01: [
    { name: 'presses Run on the starter', design: S, script: starter('l01'), expect: { won: false, reason: 'script_ended' } },
    { name: 'thinks in metres: forward(4)', design: S, script: 'bot.drive.forward(4)\n', expect: { won: false, reason: 'script_ended' } },
    { name: 'drops .drive: bot.forward(400)', design: S, script: 'bot.forward(400)\n', expect: { won: false, error: 'AttributeError' } },
    { name: 'two half steps', design: S, script: 'bot.drive.forward(200)\nbot.drive.forward(200)\n', expect: { won: true, stars: 2 } },
    { name: 'forward(400)', design: S, script: 'bot.drive.forward(400)\n', expect: { won: true, stars: 3 } },
  ],
  l02: [
    { name: 'turns the wrong way', design: S, script: `${starter('l02')}bot.drive.turn(90)\nbot.drive.forward(240)\n`, expect: { won: false, reason: 'script_ended' } },
    { name: 'stops after two legs', design: S, script: `${starter('l02')}bot.drive.turn(-90)\nbot.drive.forward(240)\n`, expect: { won: false, reason: 'script_ended' } },
    {
      name: 'overshoots every leg',
      design: S,
      script: 'bot.drive.forward(440)\nbot.drive.turn(-90)\nbot.drive.forward(300)\nbot.drive.turn(90)\nbot.drive.forward(200)\n',
      expect: { won: true, stars: 3 },
    },
  ],
  l03: [
    { name: 'forgets to fit the rangefinder', design: S, script: starter('l03'), expect: { won: false, error: 'PartNotFitted' } },
    { name: 'fills in only the if branch (first run: left blocked)', design: S_RANGE, script: L3_IF, expect: { won: false, reason: 'script_ended' } },
    { name: 'no if, always the left lane (left blocked)', design: S_RANGE, script: L3_LEFT_ONLY, seed: 1, expect: { won: false } },
    { name: 'both branches, left blocked', design: S_RANGE, script: l3Both, seed: 1, expect: { won: true, stars: 2 } },
    { name: 'both branches, right blocked', design: S_RANGE, script: l3Both, seed: 7, expect: { won: true, stars: 2 } },
  ],
  l04: [
    { name: 'forward only, no turn', design: S_GPS, script: `${starter('l04')}    bot.drive.forward(bot.gps.distance_to(x, y))\n`, expect: { won: false } },
    {
      name: 'drives before turning',
      design: S_GPS,
      script: `${starter('l04')}    bot.drive.forward(bot.gps.distance_to(x, y))\n    bot.drive.turn(bot.gps.bearing_to(x, y))\n`,
      expect: { won: false },
    },
    {
      name: 'no loop: four copies of the two lines',
      design: S_GPS,
      script: [[160, 100], [640, 100], [700, 460], [400, 280]]
        .map(([x, y]) => `bot.drive.turn(bot.gps.bearing_to(${x}, ${y}))\nbot.drive.forward(bot.gps.distance_to(${x}, ${y}))\n`)
        .join(''),
      expect: { won: true, stars: 2 },
    },
    {
      name: 'hints: turn then drive in the loop',
      design: S_GPS,
      script: `${starter('l04')}    bot.drive.turn(bot.gps.bearing_to(x, y))\n    bot.drive.forward(bot.gps.distance_to(x, y))\n`,
      expect: { won: true, stars: 3 },
    },
  ],
  l05: [
    { name: 'presses Run on the starter', design: M_GUNNER, script: starter('l05'), expect: { won: false, error: 'BlasterNotReady' } },
    {
      name: 'counts shots but never waits',
      design: M_GUNNER,
      script: l5(L5_MIDDLE_LAST, '    shots = 0\n    while shots < 2:\n        bot.blaster.fire()\n        shots = shots + 1\n'),
      expect: { won: false, error: 'BlasterNotReady' },
    },
    { name: 'waits properly, middle turret last', design: M_GUNNER, script: l5(L5_MIDDLE_LAST, L5_TWO_SHOTS), expect: { won: false, reason: 'bot_destroyed' } },
    { name: 'all hints: middle turret first', design: M_GUNNER, script: l5(L5_MIDDLE_FIRST, L5_TWO_SHOTS), expect: { won: true, stars: 3 } },
  ],
  l06: [
    { name: 'calls it twice, no loop', design: S_BUMP, script: l6('    bot.drive.backward(22)', 'drive_until_bump()\nbot.drive.turn(90)\ndrive_until_bump()\nbot.drive.turn(90)\n'), expect: { won: false, reason: 'script_ended' } },
    { name: 'no bumper: blocking forward into walls', design: S, script: 'while True:\n    bot.drive.forward(1000)\n    bot.drive.backward(22)\n    bot.drive.turn(90)\n', expect: { won: true, stars: 2 } },
    { name: 'all hints', design: S_BUMP, script: l6('    bot.drive.backward(22)', L6_LOOP), expect: { won: true, stars: 3 } },
  ],
  l07: [
    { name: 'presses Run on the starter', design: M_RADAR, script: starter('l07'), expect: { won: false, reason: 'time_up' } },
    { name: 'fires without checking ready()', design: M_RADAR, script: l7('            bot.blaster.fire()', '0.2'), expect: { won: false, error: 'BlasterNotReady' } },
    { name: 'hints 1+2: snipes from the start pad', design: M_RADAR, script: l7(L7_FIRE, '1'), expect: { won: true, stars: 2 } },
    { name: 'all hints: closes in, wait 0.5', design: M_RADAR, script: l7(L7_CLOSE_IN, '0.5'), expect: { won: true, stars: 3 } },
  ],
  l08: [
    { name: 'keeps the wheels', design: M_GPS('wheels'), script: L8_LOOP, expect: { won: false, reason: 'time_up' } },
    {
      name: 'tracks, straight through the lava',
      design: M_GPS('tracks'),
      script: L8_LOOP.replace('[(280, 120), (380, 40), (520, 40), (600, 440), (820, 120)]', '[(280, 120), (600, 440), (820, 120)]'),
      expect: { won: true, stars: 2 },
    },
    { name: 'tracks + the loop', design: M_GPS('tracks'), script: L8_LOOP, expect: { won: true, stars: 3 } },
  ],
  l09: [
    { name: 'sits still', design: M_SHIELD, script: 'while True:\n    bot.wait(1)\n', expect: { won: false, reason: 'bot_destroyed' } },
    { name: 'presses Run on the starter (shield always on)', design: M_SHIELD, script: starter('l09'), expect: { won: false, reason: 'bot_destroyed' } },
    { name: 'hint 1: shield when close, no shooting', design: M_SHIELD, script: l9(false), expect: { won: false, reason: 'bot_destroyed' } },
    { name: 'hints 1+2: shield when close and shoot back', design: M_SHIELD, script: l9(true), expect: { won: true, stars: 3 } },
  ],
  l10: [
    { name: 'presses Run on the starter', design: L_SHIELD, script: starter('l10'), expect: { won: false, reason: 'time_up' } },
    { name: 'hints 1+2 on a medium chassis, no shield', design: M_SHIELD, script: L10_ATTACK, expect: { won: false, reason: 'bot_destroyed' } },
    { name: 'hints 1+2 on a large chassis, no shield', design: L_SHIELD, script: L10_ATTACK, expect: { won: true, stars: [1, 2] } },
    { name: 'all hints', design: L_SHIELD, script: L10_SHIELD, expect: { won: true, stars: 3 } },
  ],
};

describe('novice attempts (headless Pyodide)', () => {
  for (const [id, attempts] of Object.entries(ATTEMPTS)) {
    for (const a of attempts) {
      it(`${id}: ${a.name}`, async () => {
        const run = await runMatchHeadless(getLevel(id)!, a.design, a.script, a.seed);
        const { won, reason, stars, seconds, damageTaken } = run.result;
        const got = JSON.stringify({ won, reason, stars, seconds, damageTaken, error: run.error?.type });
        expect(won, got).toBe(a.expect.won);
        if (a.expect.reason) expect(reason, got).toBe(a.expect.reason);
        if (a.expect.error) {
          expect(run.error?.type, got).toBe(a.expect.error);
          expect(run.error?.friendly, got).toBeTruthy();
        }
        const s = a.expect.stars;
        if (typeof s === 'number') expect(stars, got).toBe(s);
        else if (s) {
          expect(stars, got).toBeGreaterThanOrEqual(s[0]);
          expect(stars, got).toBeLessThanOrEqual(s[1]);
        }
      });
    }
  }
});
