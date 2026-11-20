import type { LevelDef } from '../shared/level';

export const l08: LevelDef = {
  id: 'l08',
  number: 8,
  title: 'Rough Ground',
  concept: 'state',
  label: 'D-08',
  brief:
    "The quarry floor is all broken rock with a lava channel down the middle. Wheels hate rock; " +
    "your new tracks don't care. Grab three coolant cores before the clock runs out, and keep " +
    "score as you go: a bot that remembers how it's doing can decide what to do next.",
  lesson: {
    title: 'variables & state',
    snippet: 'collected = 0\nfor x, y in cores:\n    ...\n    collected = collected + 1\n    print(collected, "down")',
    blurb: 'A variable remembers a value. Update it as things happen, and the loop knows where it is.',
  },
  map: [
    '..RRRRRRRR..RRRRRRRR..',
    '..RRRRRRRR..RRRRRRRR..',
    '..RRRRRRRRLLRRRRRRRR..',
    '..RRRRRRRRLLRRRRRRRR..',
    '..RRRRRRRRLLRRRRRRRR..',
    '..RRRRRRRRLLRRRRRRRR..',
    '..RRRRRRRRLLRRRRRRRR..',
    '..RRRRRRRRLLRRRRRRRR..',
    '..RRRRRRRRLLRRRRRRRR..',
    '..RRRRRRRRLLRRRRRRRR..',
    '..RRRRRRRRLLRRRRRRRR..',
    '..RRLLRRRRLLRRRRR##R..',
    '..RRLLRRRRLLRRRRR##R..',
    '..RRRRRRRRLLRRRRRRRR..',
  ],
  spawn: { x: 60, y: 280, heading: 90 },
  objectives: [
    {
      type: 'collect',
      id: 'cores',
      label: 'Collect 3 coolant cores',
      items: [
        { x: 280, y: 120 },
        { x: 600, y: 440 },
        { x: 820, y: 120 },
      ],
      radius: 30,
    },
  ],
  timeLimit: 22,
  enemies: [],
  budget: { weight: 40, power: 4 },
  unlocks: ['tracks'],
  stars: [
    { type: 'time', seconds: 20, label: 'Under 20 seconds' },
    { type: 'damage', max: 10, label: 'Take 10 damage or less' },
  ],
  seed: 808,
  starter: `# Rough ground slows wheels to a crawl. Tracks ignore it.
# The lava channel burns 25 hull per second. There's a cool bridge at the top.
route = [(350, 150), (475, 50), (650, 50), (750, 550), (1025, 150)]

# STATE: variables that remember how things are going.
leg = 0
hull = bot.health()

for x, y in route:
    leg = leg + 1
    print("Leg", leg, "- hull", hull)
    # TODO: turn to face (x, y) and drive there, like on Patrol Route.
    # Then update hull, and print how much the leg cost you.
`,
  hints: [
    'Tracks! Wheels on rock move at 40% speed and will not beat the clock.',
    'In the loop: bot.drive.turn(bot.gps.bearing_to(x, y)) then bot.drive.forward(bot.gps.distance_to(x, y))',
    'After each leg, damage = hull - bot.health(), then hull = bot.health() so the next leg starts fresh.',
  ],
  solution: {
    design: { chassis: 'chassis_m', drive: 'tracks', slots: { front: 'gps' } },
    script: 'solutions/l08.py',
  },
};
