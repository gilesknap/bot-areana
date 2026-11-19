import type { LevelDef } from '../shared/level';
import { ENEMY } from './common';

export const l10: LevelDef = {
  id: 'l10',
  number: 10,
  title: 'The Gauntlet',
  concept: 'classes',
  label: 'F-10',
  brief:
    "Final exam. A turret guards the north wall, a gunner lurks to the west and runs when it's " +
    "losing, and something small and twitchy is parked in the east with a lot of explosives " +
    "and no plans for later. Destroy all three. Your script is getting big, so give it some " +
    "structure: a class that keeps its own notes is easier to grow than a pile of lines.",
  lesson: {
    title: 'functions & classes',
    snippet:
      'class Hunter:\n    def __init__(self):\n        self.shots = 0\n\n    def fire(self):\n        bot.blaster.fire()\n        self.shots += 1',
    blurb: 'A class bundles data (self.shots) with the functions (methods) that use it.',
  },
  map: [
    '......................',
    '.......##.....##..PP..',
    '.......##.....##..PP..',
    '......................',
    '......................',
    '..##..............##..',
    '..##..............##..',
    '......................',
    '..........RR..........',
    '..........RR..........',
    '......................',
    '...WW.................',
    '...WW.................',
    '......................',
    '......................',
    '......................',
  ],
  spawn: { x: 440, y: 580, heading: 0 },
  objectives: [{ type: 'destroy', id: 'all', label: 'Destroy all 3 enemies' }],
  timeLimit: 150,
  enemies: [
    {
      id: 'turret',
      behaviour: 'turret',
      design: ENEMY.turret,
      spawn: { x: 440, y: 60, heading: 180 },
      params: { sightRange: 450, fireRange: 400, fireDelay: 1 },
    },
    {
      id: 'gunner',
      behaviour: 'coward',
      design: ENEMY.gunner,
      spawn: { x: 100, y: 120, heading: 180 },
      params: { sightRange: 350, fleeBelow: 0.3, speedFactor: 0.6, fireDelay: 1 },
    },
    {
      id: 'kamikaze',
      behaviour: 'kamikaze',
      design: ENEMY.kamikaze,
      spawn: { x: 820, y: 400, heading: 270 },
      params: { sightRange: 400, speedFactor: 0.6 },
    },
  ],
  budget: { weight: 70, power: 12 },
  unlocks: ['ram', 'hover'],
  stars: [
    { type: 'time', seconds: 40, label: 'Under 40 seconds' },
    { type: 'damage', max: 60, label: 'Take 60 damage or less' },
  ],
  seed: 1010,
  starter: `# A CLASS bundles data and the functions that use it.
# self is "this particular hunter": self.shots is its own notebook entry.

class Hunter:
    def __init__(self):
        self.shots = 0

    def nearest_enemy(self):
        """The closest bot or turret on radar, or None."""
        for thing in bot.radar.scan():
            if thing.kind == "bot" or thing.kind == "turret":
                return thing
        return None

    def attack(self, target):
        # TODO: face the target, close in if it is far away, fire when ready.
        print("Target:", target.kind, "at", target.distance, "cm")

    def hunt(self):
        while True:
            target = self.nearest_enemy()
            if target is None:
                bot.wait(0.5)   # TODO: go looking instead of waiting
            else:
                self.attack(target)
                bot.wait(0.2)

Hunter().hunt()
`,
  hints: [
    'In attack(): bot.drive.turn(target.bearing), then fire if bot.blaster.ready() and the target is within about 350 cm.',
    'If the target is further than that, drive part of the way: bot.drive.forward(target.distance - 300).',
    'Shields win this one: raise bot.shield whenever an enemy is within about 400 cm and the battery is above 15%, drop it otherwise.',
  ],
  solution: {
    design: {
      chassis: 'chassis_l',
      drive: 'wheels',
      slots: { front: 'blaster', rear: 'radar', left: 'shield', right: 'gps', centre: 'battery_plus' },
    },
    script: 'solutions/l10.py',
  },
};
