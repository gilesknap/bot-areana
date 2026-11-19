import type { LevelDef } from '../shared/level';
import { ENEMY } from './common';

const chaser = { speedFactor: 0.7, fireDelay: 1, fireRange: 350 };

export const l09: LevelDef = {
  id: 'l09',
  number: 9,
  title: 'Overcharge',
  concept: 'resources',
  label: 'E-09',
  brief:
    "Two chasers, one minute, no exits. Your new shield soaks up most of a hit, but it drinks " +
    "8 energy a second, and so does your patience. Raise it when they're close, drop it when " +
    "they're not, and keep an eye on the battery. A flat bot is a target.",
  lesson: {
    title: 'managing resources',
    snippet: 'if bot.battery.level() > 30:\n    bot.shield.on()\nelse:\n    bot.shield.off()',
    blurb: 'Check what you have before you spend it. Numbers from sensors drive the decision.',
  },
  map: [
    '....................',
    '....................',
    '....................',
    '....##........##....',
    '....##........##....',
    '....................',
    '....................',
    '.........##.........',
    '....................',
    '....................',
    '....##........##....',
    '....##........##....',
    '....................',
    '....................',
    '....................',
  ],
  spawn: { x: 400, y: 400, heading: 0 },
  objectives: [{ type: 'survive', id: 'survive', label: 'Survive for 60 seconds', seconds: 60 }],
  timeLimit: 90,
  enemies: [
    { id: 'chaser1', behaviour: 'chase', design: ENEMY.gunner, spawn: { x: 60, y: 60, heading: 135 }, params: chaser },
    {
      id: 'chaser2',
      behaviour: 'chase',
      design: ENEMY.gunner,
      spawn: { x: 740, y: 540, heading: 315 },
      params: { ...chaser, delay: 300 },
    },
  ],
  budget: { weight: 50, power: 10 },
  unlocks: ['shield', 'battery_plus'],
  stars: [
    { type: 'energy', min: 25, label: 'Finish with 25% battery or more' },
    { type: 'damage', max: 50, label: 'Take 50 damage or less' },
  ],
  seed: 909,
  starter: `# The shield cuts damage by 80% while it's on, but drains 8 energy a second.
# bot.battery.level() tells you how much energy is left (0 to 100).
# Fire costs 5 energy, scans cost 1. Run out and the shield drops.

bot.shield.on()
while True:
    print("Battery:", bot.battery.level(), "%  Hull:", bot.health())
    bot.wait(1)
    # TODO: only keep the shield up when a chaser is close and you can afford it.
    # TODO: shoot back! Use bot.radar.scan() to find them.
`,
  hints: [
    'Shield on all the time runs the battery flat in under a minute. Only raise it when a bot is within about 350 cm.',
    'Fighting back helps: a destroyed chaser does no damage. Turn to the nearest "bot" from scan() and fire when ready.',
    'Each loop: scan, decide shield on/off from distance and battery.level(), turn, fire, then bot.wait(0.2).',
  ],
  solution: {
    design: {
      chassis: 'chassis_m',
      drive: 'wheels',
      slots: { front: 'blaster', rear: 'radar', left: 'shield', centre: 'battery_plus' },
    },
    script: 'solutions/l09.py',
  },
};
