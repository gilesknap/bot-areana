import type { LevelDef } from '../shared/level';

export const l02: LevelDef = {
  id: 'l02',
  number: 2,
  title: 'Corners',
  concept: 'arguments',
  label: 'A-02',
  brief:
    "The flag is hiding round two corners of an old service corridor. Bots that drive " +
    "straight at it meet the wall, which is educational but slow. Drive, turn, drive again: " +
    "the order of your lines is the order things happen.",
  lesson: {
    title: 'sequences & arguments',
    snippet: 'bot.drive.forward(500)\nbot.drive.turn(-90)\nbot.drive.forward(300)',
    blurb: 'Lines run top to bottom. A positive turn goes right, a negative one goes left.',
  },
  map: [
    '##################',
    '##################',
    '##################',
    '###########......#',
    '###########......#',
    '###########..#####',
    '###########..#####',
    '###########..#####',
    '###########..#####',
    '#............#####',
    '#............#####',
    '##################',
  ],
  spawn: { x: 80, y: 400, heading: 90 },
  objectives: [{ type: 'reach', id: 'flag', label: 'Reach the flag', target: { x: 640, y: 160 }, radius: 30 }],
  timeLimit: 40,
  enemies: [],
  budget: { weight: 20, power: 0 },
  unlocks: [],
  stars: [
    { type: 'time', seconds: 8, label: 'Under 8 seconds' },
    { type: 'lines', max: 5, label: 'Five lines of code or fewer' },
  ],
  seed: 202,
  starter: `# Functions take ARGUMENTS: the values in the brackets.
#   bot.drive.forward(cm)     drive this many centimetres
#   bot.drive.turn(degrees)   positive turns right, negative turns left
#
# Lines run in order, top to bottom.
# The first leg of the corridor is 500 cm long:
bot.drive.forward(500)

# Now turn to face up the corridor... and keep going!
`,
  hints: [
    'After the first leg the corridor goes up, which is to the LEFT of the way you are facing.',
    'Turning left is a negative number: bot.drive.turn(-90). Each floor plate is 100 cm across.',
    'forward(500), turn(-90), forward(300), turn(90), forward(200).',
  ],
  solution: { design: { chassis: 'chassis_s', drive: 'wheels', slots: {} }, script: 'solutions/l02.py' },
};
