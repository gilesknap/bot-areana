import type { LevelDef } from '../shared/level';
import { ENEMY } from './common';

/** Turrets on the outside ring can't reach the start pad; the middle one can. */
const ring = { sightRange: 450, fireRange: 300 };

export const l05: LevelDef = {
  id: 'l05',
  number: 5,
  title: 'Target Practice',
  concept: 'while',
  label: 'C-05',
  brief:
    "Five turrets hold the old test yard. They can't move, but they track anything that does. " +
    "Four sit just out of range of your start pad; the one in the middle does not, so maybe " +
    "start there. Your new blaster needs a moment between shots, so don't waste them.",
  lesson: {
    title: 'while loops',
    snippet: 'while not bot.blaster.ready():\n    bot.wait(0.1)\nbot.blaster.fire()',
    blurb: 'Repeat something until a condition changes.',
  },
  map: [
    '........######........',
    '......................',
    '..#................#..',
    '..#................#..',
    '......................',
    '......................',
    '......................',
    '......................',
    '......................',
    '......................',
    '......................',
    '......................',
    '......................',
    '.##................##.',
    '.##................##.',
    '......................',
  ],
  spawn: { x: 440, y: 580, heading: 0 },
  objectives: [{ type: 'destroy', id: 'turrets', label: 'Destroy all 5 turrets' }],
  timeLimit: 90,
  enemies: [
    { id: 'turret1', behaviour: 'turret', design: ENEMY.turret, spawn: { x: 160, y: 360, heading: 90 }, params: ring },
    { id: 'turret2', behaviour: 'turret', design: ENEMY.turret, spawn: { x: 260, y: 140, heading: 90 }, params: ring },
    { id: 'turret3', behaviour: 'turret', design: ENEMY.turret, spawn: { x: 620, y: 140, heading: 270 }, params: ring },
    { id: 'turret4', behaviour: 'turret', design: ENEMY.turret, spawn: { x: 720, y: 360, heading: 270 }, params: ring },
    {
      id: 'turret5',
      behaviour: 'turret',
      design: ENEMY.turret,
      spawn: { x: 440, y: 300, heading: 0 },
      params: { sightRange: 450, fireRange: 450, fireDelay: 1 },
    },
  ],
  budget: { weight: 40, power: 8 },
  unlocks: ['blaster', 'battery', 'chassis_m'],
  stars: [
    { type: 'time', seconds: 25, label: 'Under 25 seconds' },
    { type: 'damage', max: 20, label: 'Take 20 damage or less' },
  ],
  seed: 505,
  starter: `# Turret positions, from the yard plans.
turrets = [(160, 360), (260, 140), (620, 140), (720, 360), (440, 300)]

for x, y in turrets:
    bot.drive.turn(bot.gps.bearing_to(x, y))
    # Problem 1: one bolt isn't enough to destroy a turret.
    # Problem 2: the blaster needs about a second to cool down,
    #            and fire() raises BlasterNotReady if it isn't ready.
    # A while loop can wait until bot.blaster.ready() is True.
    bot.blaster.fire()
`,
  hints: [
    'Each turret takes two hits. Count your shots in a variable: shots = 0 ... shots = shots + 1',
    'Wait for the blaster inside a loop:  while not bot.blaster.ready():  then  bot.wait(0.1)',
    'The middle turret (440, 300) is close enough to shoot back. Move it to the front of the list.',
  ],
  solution: {
    design: { chassis: 'chassis_m', drive: 'wheels', slots: { front: 'blaster', rear: 'gps', centre: 'battery' } },
    script: 'solutions/l05.py',
  },
};
