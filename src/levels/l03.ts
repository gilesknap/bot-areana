import type { LevelDef } from '../shared/level';

export const l03: LevelDef = {
  id: 'l03',
  number: 3,
  title: 'Blind Spot',
  concept: 'if / else',
  label: 'B-03',
  brief:
    "Two lanes run round the big block to the flag, and the yard crew drops a barrier into " +
    "one of them. Which one? Depends on the day. Your new rangefinder can see what's ahead, " +
    "so look before you leap and let your code make the call.",
  lesson: {
    title: 'if / else',
    snippet: 'if bot.front_sensor.distance() > 300:\n    print("clear!")\nelse:\n    print("blocked")',
    blurb: 'Run one block of code or the other, depending on a comparison.',
  },
  map: [
    '...............',
    '...............',
    '...............',
    '...#########...',
    '...#########...',
    '...#########...',
    '...#########...',
    '...#########...',
    '...#########...',
    '...............',
    '...............',
    '...............',
    '...............',
  ],
  // One of the two side lanes is blocked, chosen by the run's seed.
  randomWalls: {
    options: [[{ x: 0, y: 200, w: 120, h: 40 }], [{ x: 480, y: 200, w: 120, h: 40 }]],
    count: 1,
  },
  spawn: { x: 300, y: 440, heading: 0 },
  objectives: [{ type: 'reach', id: 'flag', label: 'Reach the flag', target: { x: 300, y: 60 }, radius: 30 }],
  timeLimit: 45,
  enemies: [],
  budget: { weight: 20, power: 2 },
  unlocks: ['rangefinder'],
  stars: [
    { type: 'time', seconds: 15, label: 'Under 15 seconds' },
    { type: 'lines', max: 14, label: '14 lines of code or fewer' },
  ],
  seed: 303,
  starter: `# One of the two side lanes is blocked - and it changes between runs!
# Fit a rangefinder to the FRONT slot: bot.front_sensor.distance()
# tells you how many cm of clear space are in front of the bot.

# Head over to the bottom of the left lane and look up it.
bot.drive.turn(-90)
bot.drive.forward(240)
bot.drive.turn(90)

gap = bot.front_sensor.distance()
print("Clear road ahead:", gap, "cm")

if gap > 300:
    print("Left lane is open!")
    # Drive up the lane, then turn right towards the flag.
else:
    print("Blocked. Time for the right lane.")
    # Turn right, cross over to the right lane and go up that one.
`,
  hints: [
    "An open lane reads about 420 cm; a blocked one under 200. That's why the starter compares with 300.",
    'Each lane is 380 cm long, and the flag is 240 cm across from the top of either lane. The right lane is 480 cm to the right of the left one.',
    'If blocked: turn(90), forward(480), turn(-90), forward(380), turn(-90), forward(240).',
  ],
  solution: {
    design: { chassis: 'chassis_s', drive: 'wheels', slots: { front: 'rangefinder' } },
    script: 'solutions/l03.py',
  },
};
