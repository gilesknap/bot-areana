import type { LevelDef } from '../shared/level';

export const l06: LevelDef = {
  id: 'l06',
  number: 6,
  title: 'Bump & Run',
  concept: 'def, bool',
  label: 'C-06',
  brief:
    "Three data cores went missing in the coil store, a corridor that winds inward like a " +
    "snail shell. Nobody kept a map. Luckily every corner works the same way: drive until " +
    "you bump into something, back off, turn right. Teach your bot that trick once, by name.",
  lesson: {
    title: 'def & booleans',
    snippet: 'def bumped():\n    return bot.front_bumper.hit()\n\nif bumped():\n    bot.drive.turn(90)',
    blurb: 'def gives a block of code a name. True and False are values you can return and test.',
  },
  map: [
    '..................',
    '..................',
    '..##############..',
    '..#............#..',
    '..#............#..',
    '..#..########..#..',
    '..#..#......#..#..',
    '..#..#......#..#..',
    '..#..#..#####..#..',
    '..#..#.........#..',
    '..#..#.........#..',
    '..#..###########..',
    '..#...............',
    '..#...............',
  ],
  spawn: { x: 40, y: 520, heading: 0 },
  objectives: [
    {
      type: 'collect',
      id: 'cores',
      label: 'Collect 3 data cores',
      items: [
        { x: 520, y: 40 },
        { x: 160, y: 280 },
        { x: 420, y: 280 },
      ],
      radius: 30,
    },
  ],
  timeLimit: 90,
  enemies: [],
  budget: { weight: 20, power: 2 },
  unlocks: ['bump'],
  stars: [
    { type: 'time', seconds: 40, label: 'Under 40 seconds' },
    { type: 'lines', max: 12, label: '12 lines of code or fewer' },
  ],
  seed: 606,
  starter: `# Fit a bump sensor to the FRONT slot.
# bot.front_bumper.hit() is True if the front touched something since you
# last asked, otherwise False. True and False are BOOLEANS.

# def makes a new function. Its indented block runs each time you call it.
def drive_until_bump():
    # Start driving WITHOUT waiting, so the next lines run while you move:
    bot.drive.forward(1000, wait=False)
    # TODO: keep checking the bumper until it says True,
    #       then back off a little (the corridors are 80 cm wide).
    pass

drive_until_bump()
bot.drive.turn(90)
# ...and again, and again. Is there a shorter way to say "forever"?
`,
  hints: [
    'Inside the function: while not bot.front_bumper.hit(): bot.wait(0.1)',
    'hit() remembers a bump until you ask, so call it once before you set off to forget the last wall. After a bump, bot.drive.backward(22) puts you in the middle of the next corridor.',
    'Finish with:  while True:  drive_until_bump()  bot.drive.turn(90). The match ends when the last core is yours.',
  ],
  solution: {
    design: { chassis: 'chassis_s', drive: 'wheels', slots: { front: 'bump' } },
    script: 'solutions/l06.py',
  },
};
