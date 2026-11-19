/**
 * The Python API, per part. This one spec drives:
 *  - the Python `bot` object built in the worker (src/python),
 *  - the sim's call dispatch (src/sim, keyed by part + method name),
 *  - CodeMirror autocomplete and the in-game API reference (src/ui),
 *  - the Workshop "YOUR PYTHON API" preview.
 *
 * Conventions (see src/shared/geometry.ts): distances in cm, angles in degrees, heading 0 = up,
 * clockwise positive; bearings are relative, positive = to the right.
 * Every call except bot.log() costs at least one tick so `while` loops always let time pass.
 */
import type { ApiMethod, ApiParam, PartApi } from '../shared/api';
import type { BotDesign, PartId } from '../shared/parts';
import { PARTS } from './catalogue';
import { fittedApi } from './naming';

const WAIT: ApiParam = {
  name: 'wait',
  type: 'bool',
  default: 'True',
  doc: 'True: return when the move is finished. False: start it and carry on straight away.',
};

const DRIVE_METHODS: readonly ApiMethod[] = [
  {
    name: 'forward',
    params: [{ name: 'distance', type: 'float', doc: 'How far to drive, in cm. Negative drives backwards.' }, WAIT],
    returns: 'float | None',
    summary: 'Drive forward a distance in cm.',
    doc: 'Drives straight ahead. With wait=True returns how far the bot actually moved (less if something blocked it). With wait=False returns None immediately and the bot keeps going; any new drive command replaces the current one.',
    ticks: 'action',
    example: 'bot.drive.forward(100)',
  },
  {
    name: 'backward',
    params: [{ name: 'distance', type: 'float', doc: 'How far to reverse, in cm.' }, WAIT],
    returns: 'float | None',
    summary: 'Reverse a distance in cm.',
    doc: 'Same as forward() but in reverse.',
    ticks: 'action',
    example: 'bot.drive.backward(50)',
  },
  {
    name: 'turn',
    params: [{ name: 'degrees', type: 'float', doc: 'Positive turns right (clockwise), negative turns left.' }, WAIT],
    returns: 'None',
    summary: 'Turn on the spot by some degrees (+ is right).',
    doc: 'Turns on the spot. turn(90) is a right angle to the right; turn(-90) to the left. Pass a radar bearing to face a target: bot.drive.turn(t.bearing).',
    ticks: 'action',
    example: 'bot.drive.turn(90)',
  },
  {
    name: 'stop',
    params: [],
    returns: 'None',
    summary: 'Stop moving.',
    doc: 'Cancels any move started with wait=False. Hover bots drift to a stop.',
    ticks: 1,
    example: 'bot.drive.stop()',
  },
  {
    name: 'is_moving',
    params: [],
    returns: 'bool',
    summary: 'True while a move or turn is in progress.',
    doc: 'Useful with wait=False moves: loop until it becomes False.',
    ticks: 1,
    example: 'while bot.drive.is_moving():\n    print(bot.front_sensor.distance())',
  },
];

export const CORE_API: PartApi = {
  part: 'core',
  summary: 'Always available on every bot.',
  methods: [
    {
      name: 'log',
      params: [{ name: 'values', type: 'object', doc: 'Anything to show in the console.', variadic: true }],
      returns: 'None',
      summary: 'Write to the console (like print).',
      doc: 'Writes the values to the console, tagged as a bot log line. Takes no time.',
      ticks: 0,
      example: 'bot.log("starting")',
    },
    {
      name: 'wait',
      params: [{ name: 'seconds', type: 'float', doc: 'How long to sit still.' }],
      returns: 'None',
      summary: 'Do nothing for some seconds.',
      doc: 'Idles while the world carries on (and the battery recharges). Always at least one tick.',
      ticks: 'seconds',
      example: 'bot.wait(0.5)',
    },
    {
      name: 'health',
      params: [],
      returns: 'int',
      summary: 'Current hull points.',
      doc: 'Hull points left. When it reaches 0 your bot is destroyed.',
      ticks: 1,
      example: 'if bot.health() < 30:\n    bot.shield.on()',
    },
    {
      name: 'time',
      params: [],
      returns: 'float',
      summary: 'Seconds since the match started.',
      doc: 'Simulated seconds since the start of the run.',
      ticks: 1,
      example: 'while bot.time() < 60:\n    bot.wait(1)',
    },
  ],
};

const PART_APIS: Partial<Record<PartId, PartApi>> = {
  wheels: { part: 'wheels', summary: 'Drive train.', methods: DRIVE_METHODS },
  tracks: { part: 'tracks', summary: 'Drive train. Slow, strong, rough-ground proof.', methods: DRIVE_METHODS },
  hover: { part: 'hover', summary: 'Drive train. Fast, drifts, floats over water and pits.', methods: DRIVE_METHODS },
  rangefinder: {
    part: 'rangefinder',
    summary: 'Distance to the nearest solid thing in the direction of its slot.',
    methods: [
      {
        name: 'distance',
        params: [],
        returns: 'float',
        summary: 'cm to the nearest wall or bot it points at.',
        doc: 'Measures along the direction of the slot it is fitted to (front_sensor looks ahead, left_sensor looks left). Sees walls, bots and turrets, not floor hazards. Returns 600.0 if nothing is in range.',
        ticks: 1,
        example: 'if bot.front_sensor.distance() < 50:\n    bot.drive.turn(90)',
      },
    ],
  },
  radar: {
    part: 'radar',
    summary: 'Scans all around the bot.',
    methods: [
      {
        name: 'scan',
        params: [],
        returns: 'list[ScanResult]',
        summary: 'List what is within 500 cm, nearest first.',
        doc: 'Returns a list of objects, nearest first. Each has .kind ("turret", "bot", "core", "flag" or "waypoint"), .bearing (degrees, + is right), .distance (cm), and .x / .y. Wrecks are not listed. An empty list is falsy, so `while bot.radar.scan():` loops while anything is visible.',
        ticks: 1,
        energy: 1,
        example: 'for t in bot.radar.scan():\n    if t.kind == "turret":\n        bot.drive.turn(t.bearing)',
      },
    ],
  },
  gps: {
    part: 'gps',
    summary: 'Position and compass heading.',
    methods: [
      {
        name: 'position',
        params: [],
        returns: 'tuple[float, float]',
        summary: '(x, y) in cm from the top-left corner.',
        doc: 'Where the bot is. x grows to the right, y grows downwards (like a screen).',
        ticks: 1,
        example: 'x, y = bot.gps.position()',
      },
      {
        name: 'heading',
        params: [],
        returns: 'float',
        summary: 'Compass heading: 0 up, 90 right, 180 down, 270 left.',
        doc: 'The direction the bot faces, 0 to 360 degrees, clockwise from up.',
        ticks: 1,
        example: 'print(bot.gps.heading())',
      },
      {
        name: 'bearing_to',
        params: [
          { name: 'x', type: 'float', doc: 'Target x in cm.' },
          { name: 'y', type: 'float', doc: 'Target y in cm.' },
        ],
        returns: 'float',
        summary: 'How far to turn to face a point (+ is right).',
        doc: 'Relative bearing from the bot to the point, -180 to 180. bot.drive.turn(bot.gps.bearing_to(x, y)) faces it.',
        ticks: 1,
        example: 'bot.drive.turn(bot.gps.bearing_to(400, 200))',
      },
      {
        name: 'distance_to',
        params: [
          { name: 'x', type: 'float', doc: 'Target x in cm.' },
          { name: 'y', type: 'float', doc: 'Target y in cm.' },
        ],
        returns: 'float',
        summary: 'Straight-line cm to a point.',
        doc: 'Distance from the bot to the point, ignoring walls.',
        ticks: 1,
        example: 'bot.drive.forward(bot.gps.distance_to(400, 200))',
      },
    ],
  },
  bump: {
    part: 'bump',
    summary: 'Contact switch on one side.',
    methods: [
      {
        name: 'hit',
        params: [],
        returns: 'bool',
        summary: 'True if this side bumped into something since you last asked.',
        doc: 'Latches when that side makes a new contact with a wall or bot, and resets when you read it. Staying pressed against the same wall does not count again.',
        ticks: 1,
        example: 'if bot.front_bumper.hit():\n    bot.drive.backward(20)',
      },
    ],
  },
  blaster: {
    part: 'blaster',
    summary: 'Fires bolts in the direction of its slot.',
    methods: [
      {
        name: 'fire',
        params: [],
        returns: 'None',
        summary: 'Fire one bolt (5 energy, 1 s cooldown).',
        doc: 'Fires a bolt straight out of the slot it is fitted to. Raises BlasterNotReady while cooling down and OutOfEnergy if the battery is too low.',
        ticks: 1,
        energy: 5,
        raises: ['BlasterNotReady', 'OutOfEnergy'],
        example: 'if bot.blaster.ready():\n    bot.blaster.fire()',
      },
      {
        name: 'ready',
        params: [],
        returns: 'bool',
        summary: 'True when the blaster can fire.',
        doc: 'False while cooling down or when there is not enough energy for a shot.',
        ticks: 1,
        example: 'while not bot.blaster.ready():\n    bot.drive.turn(5)',
      },
    ],
  },
  shield: {
    part: 'shield',
    summary: 'Energy shield around the whole bot.',
    methods: [
      {
        name: 'on',
        params: [],
        returns: 'None',
        summary: 'Raise the shield (drains 8 energy/s).',
        doc: 'Blocks 80% of incoming damage while on. Drops by itself when energy runs out. Raises OutOfEnergy if the battery is empty.',
        ticks: 1,
        raises: ['OutOfEnergy'],
        example: 'bot.shield.on()',
      },
      {
        name: 'off',
        params: [],
        returns: 'None',
        summary: 'Lower the shield.',
        doc: 'Turns the shield off so the battery can recharge.',
        ticks: 1,
        example: 'bot.shield.off()',
      },
      {
        name: 'is_on',
        params: [],
        returns: 'bool',
        summary: 'True while the shield is up.',
        doc: 'The shield can switch itself off when energy runs out.',
        ticks: 1,
        example: 'if not bot.shield.is_on():\n    bot.shield.on()',
      },
    ],
  },
  battery: {
    part: 'battery',
    summary: 'Energy store.',
    methods: [
      {
        name: 'level',
        params: [],
        returns: 'float',
        summary: 'Energy left, 0 to 100 percent.',
        doc: 'How full the battery is, as a percentage of capacity.',
        ticks: 1,
        example: 'if bot.battery.level() < 20:\n    bot.wait(2)',
      },
    ],
  },
};
PART_APIS.battery_plus = { ...PART_APIS.battery!, part: 'battery_plus' };

/** API for a part, or undefined for passive parts (armour, ram) and coming-soon ones. */
export function partApi(part: PartId): PartApi | undefined {
  return PARTS[part].comingSoon ? undefined : PART_APIS[part];
}

/** The `bot` attributes and their APIs for a design, in display order (core first). */
export function botApi(design: BotDesign): Array<{ attr: string; api: PartApi }> {
  const out: Array<{ attr: string; api: PartApi }> = [{ attr: '', api: CORE_API }];
  for (const f of fittedApi(design)) {
    const api = partApi(f.part);
    if (api) out.push({ attr: f.attr, api });
  }
  return out;
}

/** "forward(distance, wait=True)" */
export function signature(m: ApiMethod): string {
  const params = m.params.map((p) => (p.variadic ? `*${p.name}` : p.default ? `${p.name}=${p.default}` : p.name));
  return `${m.name}(${params.join(', ')})`;
}
