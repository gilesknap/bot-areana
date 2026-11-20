import type { LevelDef } from '../shared/level';
import { ENEMY } from './common';

export const l07: LevelDef = {
  id: 'l07',
  number: 7,
  title: 'First Contact',
  concept: 'scan() objects',
  label: 'D-07',
  brief:
    "Something with wheels and a grudge is patrolling the east hall. It ignores you until you " +
    "get within about 300 cm, then it gets rude. Your new radar lists everything nearby, " +
    "nearest first. Find the thing whose kind is \"bot\", face it, and introduce your blaster.",
  lesson: {
    title: 'iterating objects',
    snippet: 'for thing in bot.radar.scan():\n    if thing.kind == "bot":\n        bot.drive.turn(thing.bearing)',
    blurb: 'scan() returns a list of objects. Each one has attributes: kind, bearing, distance, x, y.',
  },
  map: [
    '....................',
    '....................',
    '....................',
    '....................',
    '....##..............',
    '....##..............',
    '.........##.........',
    '.........##.........',
    '.........##.........',
    '..............##....',
    '..............##....',
    '....................',
    '....................',
    '....................',
    '....................',
  ],
  spawn: { x: 100, y: 520, heading: 45 },
  objectives: [{ type: 'destroy', id: 'patrol', label: 'Destroy the patrol bot' }],
  timeLimit: 120,
  enemies: [
    {
      id: 'patrol',
      behaviour: 'patrol',
      design: ENEMY.gunner,
      spawn: { x: 480, y: 100, heading: 90 },
      params: {
        route: [
          { x: 720, y: 100 },
          { x: 720, y: 500 },
          { x: 480, y: 500 },
          { x: 480, y: 100 },
        ],
        sightRange: 250,
        speedFactor: 0.6,
        fireDelay: 2,
      },
    },
  ],
  budget: { weight: 50, power: 10 },
  unlocks: ['radar', 'armour', 'chassis_l'],
  stars: [
    { type: 'time', seconds: 40, label: 'Under 40 seconds' },
    { type: 'damage', max: 40, label: 'Take 40 damage or less' },
  ],
  seed: 707,
  starter: `# bot.radar.scan() returns a LIST of things it can see (up to 600 cm away).
# Each thing is an OBJECT with attributes you read with a dot:
#   thing.kind       "bot", "turret", "flag", "waypoint" or "core"
#   thing.bearing    degrees to turn to face it (+ is right)
#   thing.distance   cm away
# Scanning costs 1 energy, so don't do it every single tick.

while True:
    for thing in bot.radar.scan():
        print(thing.kind, "at", thing.distance, "cm")
    # TODO: if thing.kind is "bot", turn to face it and fire when ready.
    bot.wait(1)
`,
  hints: [
    'Inside the for loop:  if thing.kind == "bot":  then  bot.drive.turn(thing.bearing)',
    'After turning, fire only when ready:  if bot.blaster.ready(): bot.blaster.fire()',
    "It won't come to you. If thing.distance is more than 400, drive closer with bot.drive.forward(75) instead of firing. A shorter wait, like 0.5, keeps you on target.",
  ],
  solution: {
    design: { chassis: 'chassis_m', drive: 'wheels', slots: { front: 'blaster', rear: 'radar', centre: 'battery' } },
    script: 'solutions/l07.py',
  },
};
