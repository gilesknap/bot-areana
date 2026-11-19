import type { LevelDef } from '../shared/level';

export const l01: LevelDef = {
  id: 'l01',
  number: 1,
  title: 'First Steps',
  concept: 'function calls',
  label: 'A-01',
  brief:
    "Welcome to the proving grounds, recruit. Your bot has wheels, a hull and absolutely no " +
    "initiative: it does exactly what your code says and not a centimetre more. The flag is " +
    "400 cm dead ahead. Tell the bot to go and get it.",
  lesson: {
    title: 'calling functions',
    snippet: 'bot.drive.forward(400)',
    blurb: 'Call a function with brackets. The number inside says how far, in cm.',
  },
  map: [
    '................',
    '.##..........##.',
    '.#............#.',
    '................',
    '................',
    '................',
    '................',
    '.#............#.',
    '.##..........##.',
    '................',
  ],
  spawn: { x: 100, y: 200, heading: 90 },
  objectives: [{ type: 'reach', id: 'flag', label: 'Reach the flag', target: { x: 500, y: 200 }, radius: 30 }],
  timeLimit: 30,
  enemies: [],
  budget: { weight: 20, power: 0 },
  unlocks: ['chassis_s', 'wheels'],
  stars: [
    { type: 'time', seconds: 4, label: 'Under 4 seconds' },
    { type: 'lines', max: 1, label: 'Use just one line of code' },
  ],
  seed: 101,
  starter: `# Welcome to Bot Arena!
# Your bot only does what your Python code tells it to.
#
# This line CALLS a function: bot.drive.forward(...)
# The number in the brackets is an argument - how many cm to drive.
#
# The flag is 400 cm ahead, but this only goes part of the way.
# Change the number, then press Run.
bot.drive.forward(100)
`,
  hints: [
    'Press Run and watch how far the bot gets. Then change the number in the brackets.',
    'Distances are in centimetres. The flag is 400 cm in front of the start pad.',
    'One line does it: bot.drive.forward(400)',
  ],
  solution: { design: { chassis: 'chassis_s', drive: 'wheels', slots: {} }, script: 'solutions/l01.py' },
};
