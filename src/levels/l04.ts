import type { LevelDef } from '../shared/level';

export const l04: LevelDef = {
  id: 'l04',
  number: 4,
  title: 'Patrol Route',
  concept: 'for, lists',
  label: 'B-04',
  brief:
    "Security wants four checkpoints visited, in order, every shift. You could write the same " +
    "two lines four times. Or you could give the bot a list and a compass and let a for " +
    "loop do the legwork. Mind the lava pool on the way past.",
  lesson: {
    title: 'for loops & lists',
    snippet: 'route = [(160, 100), (640, 100)]\nfor x, y in route:\n    print("heading for", x, y)',
    blurb: 'A list holds many values. A for loop runs its block once for each of them.',
  },
  map: [
    '.........##.........',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '......##............',
    '......##............',
    '....................',
    '....................',
    '....................',
    '.........LLL..##....',
    '.........LLL..##....',
    '....................',
  ],
  spawn: { x: 80, y: 480, heading: 0 },
  objectives: [
    {
      type: 'waypoints',
      id: 'route',
      label: 'Visit the checkpoints in order',
      points: [
        { x: 160, y: 100 },
        { x: 640, y: 100 },
        { x: 700, y: 460 },
        { x: 400, y: 280 },
      ],
      radius: 30,
    },
  ],
  timeLimit: 60,
  enemies: [],
  budget: { weight: 22, power: 3 },
  unlocks: ['gps'],
  stars: [
    { type: 'time', seconds: 18, label: 'Under 18 seconds' },
    { type: 'lines', max: 5, label: 'Five lines of code or fewer' },
  ],
  seed: 404,
  starter: `# A list keeps several values in order, inside square brackets.
# Each checkpoint here is an (x, y) pair, in cm from the top-left corner.
route = [(160, 100), (640, 100), (700, 460), (400, 280)]

# A for loop runs the indented block once for every item in the list.
for x, y in route:
    print("Next checkpoint:", x, y)
    # Fit a Compass/GPS, then inside this loop:
    #   bot.gps.bearing_to(x, y)    how many degrees to turn to face the point
    #   bot.gps.distance_to(x, y)   how many cm away it is
`,
  hints: [
    'Every line indented under the for runs once per checkpoint, with x and y set to that checkpoint.',
    'Turn first, then drive: bot.drive.turn(bot.gps.bearing_to(x, y))',
    'Add bot.drive.forward(bot.gps.distance_to(x, y)) as the second line of the loop.',
  ],
  solution: {
    design: { chassis: 'chassis_s', drive: 'wheels', slots: { front: 'gps' } },
    script: 'solutions/l04.py',
  },
};
