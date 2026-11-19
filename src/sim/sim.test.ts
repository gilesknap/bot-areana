import { describe, expect, it } from 'vitest';
import { BotApiError } from '../shared/errors';
import { TICK_RATE } from '../shared/geometry';
import type { BotDesign } from '../shared/parts';
import { createMatch } from './index';
import { Harness, WHEELS_S, enemy, makeLevel } from './testkit';

const SCOUT: BotDesign = {
  chassis: 'chassis_m',
  drive: 'wheels',
  slots: { front: 'blaster', rear: 'rangefinder', left: 'bump', right: 'gps', centre: 'battery' },
};

describe('match setup and frames', () => {
  it('emits tick 0 with one objective event per objective, then one frame per tick', () => {
    const level = makeLevel({
      objectives: [
        { type: 'reach', id: 'flag', label: 'Flag', target: { x: 100, y: 100 }, radius: 30 },
        { type: 'survive', id: 'live', label: 'Live', seconds: 100 },
      ],
    });
    const h = new Harness(level);
    expect(h.frames).toHaveLength(1);
    expect(h.frames[0]!.tick).toBe(0);
    expect(h.frames[0]!.events.filter((e) => e.type === 'objective')).toHaveLength(2);
    h.wait(1);
    expect(h.frames.map((f) => f.tick)).toEqual(Array.from({ length: 31 }, (_, i) => i));
    expect(h.frames[5]!.bots.map((b) => b.id)).toEqual(['player']);
  });

  it('builds the world: merged wall tiles, markers, bots', () => {
    const level = makeLevel(
      {
        map: ['....', '.##.', '.##.', '....'],
        spawn: { x: 20, y: 20, heading: 90 },
        objectives: [
          { type: 'waypoints', id: 'w', label: 'W', points: [{ x: 20, y: 140 }, { x: 140, y: 140 }], radius: 20 },
        ],
        enemies: [enemy('dummy', 'static', 140, 20)],
      },
      4,
      4,
    );
    const m = createMatch({ level, design: WHEELS_S, seed: 1, scriptLines: 1 });
    expect(m.world.walls).toEqual([{ x: 40, y: 40, w: 80, h: 80 }]);
    expect(m.world.width).toBe(160);
    expect(m.world.markers.map((k) => k.id)).toEqual(['w.1', 'w.2']);
    expect(m.world.bots.map((b) => [b.id, b.team, b.maxHp])).toEqual([
      ['player', 'player', 60],
      ['dummy', 'enemy', 60],
    ]);
  });

  it('merges irregular wall shapes without gaps or overlaps', () => {
    const map = ['#..#.', '##.##', '.###.', '..#..', '#####'];
    const walls = createMatch({ level: makeLevel({ map }, 5, 5), design: WHEELS_S, seed: 1, scriptLines: 1 }).world.walls;
    const tiles = map.join('').split('').filter((c) => c === '#').length;
    expect(walls.reduce((a, w) => a + (w.w * w.h) / 1600, 0)).toBe(tiles);
    expect(walls.length).toBeLessThan(tiles);
  });

  it('resolves randomWalls from the seed', () => {
    const options = [0, 1, 2, 3, 4, 5].map((i) => [{ x: i * 80, y: 0, w: 40, h: 40 }]);
    const level = makeLevel({ randomWalls: { options, count: 2 } });
    const walls = (seed: number) => createMatch({ level, design: WHEELS_S, seed, scriptLines: 1 }).world.walls;
    expect(walls(7)).toHaveLength(2);
    expect(walls(7)).toEqual(walls(7));
    const variety = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => JSON.stringify(walls(s))));
    expect(variety.size).toBeGreaterThan(1);
  });
});

describe('per-call tick costs', () => {
  it('charges 1 tick for sensors and queries, 0 for log, seconds for wait', () => {
    const h = new Harness(makeLevel(), SCOUT);
    expect(h.cost('', 'health')).toBe(1);
    expect(h.cost('', 'time')).toBe(1);
    expect(h.cost('', 'log', 'hi')).toBe(0);
    expect(h.cost('', 'wait', 0.5)).toBe(15);
    expect(h.cost('', 'wait', 0)).toBe(1);
    expect(h.cost('rear_sensor', 'distance')).toBe(1);
    expect(h.cost('gps', 'position')).toBe(1);
    expect(h.cost('left_bumper', 'hit')).toBe(1);
    expect(h.cost('battery', 'level')).toBe(1);
    expect(h.cost('blaster', 'ready')).toBe(1);
    expect(h.cost('blaster', 'fire')).toBe(1);
    expect(h.cost('drive', 'stop')).toBe(1);
    expect(h.cost('drive', 'is_moving')).toBe(1);
    expect(h.cost('drive', 'forward', 100, false)).toBe(1);
  });

  it('bot.time() reports simulated seconds and log() prints at the current tick', () => {
    const h = new Harness(makeLevel());
    h.wait(2);
    expect(h.call('', 'time')).toBe(2);
    h.call('', 'log', 'hello', 3);
    h.wait(0);
    expect(h.events('print')).toEqual([{ type: 'print', text: 'hello 3', stream: 'log' }]);
  });

  it('raises PartNotFitted for parts the bot does not have', () => {
    const h = new Harness(makeLevel());
    expect(() => h.call('radar', 'scan')).toThrow(BotApiError);
    try {
      h.call('blaster', 'fire');
    } catch (e) {
      expect((e as BotApiError).errorName).toBe('PartNotFitted');
    }
  });
});

describe('driving', () => {
  it('forward(100) moves exactly 100 cm along the heading and returns it', () => {
    const h = new Harness(makeLevel());
    const { x, y } = h.p;
    const t0 = h.m.tick;
    expect(h.call('drive', 'forward', 100, true)).toBe(100);
    expect(h.p.x).toBeCloseTo(x);
    expect(h.p.y).toBeCloseTo(y - 100); // heading 0 is up, y grows down
    // 140 cm/s top speed with a short acceleration: a bit under a second.
    expect(h.m.tick - t0).toBeGreaterThan(21);
    expect(h.m.tick - t0).toBeLessThan(30);
    expect(h.call('drive', 'is_moving')).toBe(false);
  });

  it('backward and negative forward reverse', () => {
    const h = new Harness(makeLevel());
    const y = h.p.y;
    expect(h.call('drive', 'backward', 50, true)).toBe(50);
    expect(h.p.y).toBeCloseTo(y + 50);
    expect(h.call('drive', 'forward', -50, true)).toBe(50);
    expect(h.p.y).toBeCloseTo(y + 100);
  });

  it('turn(90) turns right at the drive turn rate; negative turns left', () => {
    const h = new Harness(makeLevel());
    expect(h.cost('drive', 'turn', 90, true)).toBe(15); // 180 deg/s
    expect(h.p.heading).toBeCloseTo(90);
    h.call('drive', 'turn', -135, true);
    expect(h.p.heading).toBeCloseTo(315);
  });

  it('wait=False starts a move and returns; a new command replaces it', () => {
    const h = new Harness(makeLevel());
    expect(h.call('drive', 'forward', 200, false)).toBe(null);
    expect(h.call('drive', 'is_moving')).toBe(true);
    h.wait(0.5);
    const y = h.p.y;
    h.call('drive', 'turn', 90, false);
    h.wait(1);
    expect(h.p.y).toBeCloseTo(y, 0);
    expect(h.p.heading).toBeCloseTo(90);
    expect(h.call('drive', 'is_moving')).toBe(false);
  });

  it('stop() halts a non-blocking move', () => {
    const h = new Harness(makeLevel());
    h.call('drive', 'forward', 300, false);
    h.wait(0.3);
    h.call('drive', 'stop');
    const y = h.p.y;
    h.wait(1);
    expect(h.p.y).toBe(y);
  });

  it('a wall blocks the move: forward returns the distance actually covered', () => {
    // Wall row 4 tiles above the spawn tile centre.
    const level = makeLevel({ map: ['.....', '#####', '.....', '.....', '.....', '.....'], spawn: { x: 100, y: 220, heading: 0 } }, 5, 6);
    const h = new Harness(level);
    const moved = h.call('drive', 'forward', 500, true) as number;
    // Wall bottom at y=80, radius 18: stops with centre at y=98.
    expect(moved).toBeCloseTo(220 - 98, 0);
    expect(h.p.y).toBeCloseTo(98, 1);
    expect(h.m.tick).toBeLessThan(60);
  });

  it('the arena edge is solid even without # tiles', () => {
    const h = new Harness(makeLevel({ spawn: { x: 100, y: 100, heading: 0 } }));
    h.call('drive', 'forward', 1000, true);
    expect(h.p.y).toBeCloseTo(18, 1);
  });

  it('heavier bots are slower', () => {
    const light = new Harness(makeLevel());
    const heavy = new Harness(makeLevel(), {
      chassis: 'chassis_l',
      drive: 'wheels',
      slots: { front: 'armour', rear: 'armour', left: 'armour', right: 'armour', centre: 'battery_plus' },
    });
    const tLight = light.cost('drive', 'forward', 300, true);
    const tHeavy = heavy.cost('drive', 'forward', 300, true);
    expect(heavy.p.stats.topSpeed).toBeLessThan(light.p.stats.topSpeed);
    expect(tHeavy).toBeGreaterThan(tLight * 1.5);
  });

  it('hover drifts on after stopping, wheels stop dead', () => {
    const hover = new Harness(makeLevel(), { chassis: 'chassis_s', drive: 'hover', slots: {} });
    hover.call('drive', 'forward', 400, false);
    hover.wait(1);
    hover.call('drive', 'stop');
    const y = hover.p.y;
    hover.wait(1);
    expect(y - hover.p.y).toBeGreaterThan(10);
    // Hover is the fastest drive over a long run.
    const wheels = new Harness(makeLevel());
    const hv = new Harness(makeLevel(), { chassis: 'chassis_s', drive: 'hover', slots: {} });
    expect(hv.cost('drive', 'forward', 500, true)).toBeLessThan(wheels.cost('drive', 'forward', 500, true));
  });

  it('drains drive energy while moving', () => {
    const h = new Harness(makeLevel());
    h.p.energy = 10;
    h.call('drive', 'forward', 140, true);
    // +2/s recharge, -1/s driving over ~1.1 s
    expect(h.p.energy).toBeGreaterThan(10.5);
    expect(h.p.energy).toBeLessThan(11.5);
  });
});

describe('terrain', () => {
  const strip = (tile: string) =>
    makeLevel({ map: ['.....', `..${tile}..`, `..${tile}..`, `..${tile}..`, '.....', '.....'], spawn: { x: 100, y: 220, heading: 0 } }, 5, 6);

  it('rough ground slows wheels but not tracks', () => {
    const wheelsRough = new Harness(strip('R')).cost('drive', 'forward', 180, true);
    const wheelsFloor = new Harness(strip('.')).cost('drive', 'forward', 180, true);
    const tracks: BotDesign = { chassis: 'chassis_s', drive: 'tracks', slots: {} };
    const tracksRough = new Harness(strip('R'), tracks).cost('drive', 'forward', 180, true);
    const tracksFloor = new Harness(strip('.'), tracks).cost('drive', 'forward', 180, true);
    expect(wheelsRough).toBeGreaterThan(wheelsFloor * 1.5);
    expect(tracksRough).toBe(tracksFloor);
  });

  it('water blocks ground drives; hover crosses it', () => {
    const h = new Harness(strip('W'));
    const moved = h.call('drive', 'forward', 180, true) as number;
    expect(moved).toBeLessThan(100);
    const hv = new Harness(strip('W'), { chassis: 'chassis_s', drive: 'hover', slots: {} });
    expect(hv.call('drive', 'forward', 180, true)).toBeGreaterThan(179);
  });

  it('pits destroy ground drives and end the match', () => {
    const h = new Harness(strip('P'));
    expect(h.call('drive', 'forward', 180, true)).toBe('MATCH_OVER');
    expect(h.m.finished).toBe(true);
    expect(h.m.result()).toMatchObject({ won: false, reason: 'bot_destroyed', stars: 0 });
    expect(h.events('destroyed')[0]).toMatchObject({ botId: 'player', cause: 'pit' });
    const hv = new Harness(strip('P'), { chassis: 'chassis_s', drive: 'hover', slots: {} });
    expect(hv.call('drive', 'forward', 180, true)).toBeGreaterThan(179);
  });

  it('lava burns 25 hp/s (hover 10) and emits a hazard event on entry', () => {
    const level = makeLevel({ map: ['LLL', 'LLL', 'LLL'], spawn: { x: 60, y: 60, heading: 0 } }, 3, 3);
    const h = new Harness(level);
    h.wait(1);
    expect(h.p.hp).toBeCloseTo(60 - 25, 0);
    expect(h.events('hazard')).toHaveLength(1);
    const hv = new Harness(level, { chassis: 'chassis_s', drive: 'hover', slots: {} });
    hv.wait(1);
    expect(hv.p.hp).toBeCloseTo(50, 0);
    h.wait(2);
    expect(h.m.finished).toBe(true);
    expect(h.events('destroyed')[0]!.cause).toBe('lava');
  });
});

describe('sensors', () => {
  it('rangefinder measures from the bot edge to the nearest wall, 600 if nothing', () => {
    const level = makeLevel({ map: ['.....', '#####', '.....', '.....', '.....'], spawn: { x: 100, y: 180, heading: 0 } }, 5, 5);
    const h = new Harness(level, { chassis: 'chassis_s', drive: 'wheels', slots: { front: 'rangefinder', rear: 'rangefinder' } });
    expect(h.call('front_sensor', 'distance')).toBe(180 - 80 - 18);
    expect(h.call('rear_sensor', 'distance')).toBe(200 - 180 - 18);
    const open = new Harness(makeLevel({}, 40, 40), { chassis: 'chassis_s', drive: 'wheels', slots: { front: 'rangefinder' } });
    expect(open.call('front_sensor', 'distance')).toBe(600);
    expect(open.events('range')).toHaveLength(1);
  });

  it('rangefinder sees bots', () => {
    const level = makeLevel({ enemies: [enemy('d', 'static', 600, 400)] });
    const h = new Harness(level, { chassis: 'chassis_s', drive: 'wheels', slots: { front: 'rangefinder' } });
    expect(h.call('front_sensor', 'distance')).toBe(600 - 400 - 18 - 18);
  });

  it('radar lists enemies and objectives nearest first with bearings', () => {
    const level = makeLevel({
      objectives: [
        { type: 'collect', id: 'c', label: 'C', items: [{ x: 600, y: 520 }], radius: 20 },
        { type: 'reach', id: 'f', label: 'F', target: { x: 300, y: 600 }, radius: 20 },
      ],
      enemies: [
        enemy('t', 'turret', 700, 600, { params: { sightRange: 1 } }),
        enemy('far', 'static', 1100, 1100),
      ],
    });
    const h = new Harness(level, { chassis: 'chassis_m', drive: 'wheels', slots: { front: 'radar' } });
    const e0 = h.p.energy;
    const scan = h.call('radar', 'scan') as Array<{ kind: string; bearing: number; distance: number }>;
    expect(scan.map((s) => s.kind)).toEqual(['core', 'turret', 'flag']);
    expect(scan[0]).toMatchObject({ bearing: 0, distance: 80, x: 600, y: 520 });
    expect(scan[1]).toMatchObject({ bearing: 90, distance: 100 });
    expect(scan[2]!.bearing).toBe(-90);
    expect(h.events('scan')).toHaveLength(1);
    expect(h.p.energy).toBeLessThan(e0);
  });

  it('gps reports position, heading, bearing_to and distance_to', () => {
    const h = new Harness(makeLevel(), { chassis: 'chassis_s', drive: 'wheels', slots: { front: 'gps' } });
    expect(h.call('gps', 'position')).toEqual([600, 600]);
    h.call('drive', 'turn', 90, true);
    expect(h.call('gps', 'heading')).toBe(90);
    expect(h.call('gps', 'bearing_to', 600, 500)).toBe(-90);
    expect(h.call('gps', 'distance_to', 600, 500)).toBe(100);
    h.call('drive', 'turn', h.call('gps', 'bearing_to', 700, 700) as number, true);
    expect(h.call('gps', 'heading')).toBe(135);
  });

  it('bump latches until read', () => {
    const level = makeLevel({ spawn: { x: 100, y: 100, heading: 0 } });
    const h = new Harness(level, { chassis: 'chassis_s', drive: 'wheels', slots: { front: 'bump', rear: 'bump' } });
    expect(h.call('front_bumper', 'hit')).toBe(false);
    h.call('drive', 'forward', 200, true);
    h.wait(1);
    expect(h.call('rear_bumper', 'hit')).toBe(false);
    expect(h.call('front_bumper', 'hit')).toBe(true);
    expect(h.call('front_bumper', 'hit')).toBe(false);
    expect(h.events('bump')[0]).toMatchObject({ botId: 'player', side: 'front' });
  });
});

describe('weapons, damage and energy', () => {
  const shooter: BotDesign = { chassis: 'chassis_m', drive: 'wheels', slots: { front: 'blaster', centre: 'battery' } };

  it('blaster: cooldown, energy cost, bolt flight and damage', () => {
    const level = makeLevel({ enemies: [enemy('d', 'static', 600, 300)] });
    const h = new Harness(level, shooter);
    const e0 = h.p.energy;
    h.call('blaster', 'fire');
    expect(h.p.energy).toBeCloseTo(e0 - 5 + 3 / TICK_RATE, 5); // battery recharges 3/s
    expect(h.events('muzzle_flash')).toHaveLength(1);
    expect(h.call('blaster', 'ready')).toBe(false);
    expect(() => h.call('blaster', 'fire')).toThrow('cooling down');
    h.wait(1);
    // 600 cm/s: 300 - 24 - 18 cm takes under half a second
    const hits = h.events('hit').filter((e) => e.targetId === 'd');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ damage: 20, side: 'front', shielded: false });
    expect(h.bot('d').hp).toBe(40);
    expect(h.call('blaster', 'ready')).toBe(true);
  });

  it('bolts stop at walls and fizzle at max range', () => {
    const h = new Harness(makeLevel({ spawn: { x: 600, y: 600, heading: 0 } }), shooter);
    h.call('blaster', 'fire');
    h.wait(2);
    expect(h.events('hit')).toEqual([expect.objectContaining({ targetId: 'wall', y: 0 })]);
    const far = new Harness(makeLevel({ spawn: { x: 1000, y: 1950, heading: 0 } }, 50, 50), shooter);
    far.call('blaster', 'fire');
    far.wait(2);
    expect(far.events('hit')).toHaveLength(0);
    expect(far.frames.at(-1)!.projectiles).toHaveLength(0);
  });

  it('raises OutOfEnergy when the battery is too low', () => {
    const h = new Harness(makeLevel(), shooter);
    h.p.energy = 2;
    expect(() => h.call('blaster', 'fire')).toThrow(expect.objectContaining({ errorName: 'OutOfEnergy' }));
  });

  it('destroying all enemies wins a destroy objective', () => {
    const level = makeLevel({
      objectives: [{ type: 'destroy', id: 'kill', label: 'Kill' }],
      enemies: [enemy('d', 'static', 600, 300)],
    });
    const h = new Harness(level, shooter);
    let r: unknown;
    for (let i = 0; i < 5 && r !== 'MATCH_OVER'; i++) {
      h.call('blaster', 'fire');
      r = h.wait(1);
    }
    expect(r).toBe('MATCH_OVER');
    expect(h.m.result()).toMatchObject({ won: true, reason: 'objectives_complete' });
    expect(h.events('destroyed')[0]).toMatchObject({ botId: 'd', cause: 'damage' });
    expect(h.events('explosion')).toHaveLength(1);
    expect(h.frames.at(-1)!.bots[1]!.alive).toBe(false);
  });

  it('armour halves damage on its side only; a shield removes 80% from any side', () => {
    const turret = (heading: number) =>
      makeLevel({ spawn: { x: 600, y: 600, heading }, enemies: [enemy('t', 'turret', 600, 400, { spawn: { x: 600, y: 400, heading: 180 } })] });
    const armoured: BotDesign = { chassis: 'chassis_m', drive: 'wheels', slots: { front: 'armour' } };
    const facing = new Harness(turret(0), armoured);
    facing.wait(0.5);
    expect(facing.events('hit')[0]).toMatchObject({ targetId: 'player', damage: 10, side: 'front' });
    const sideways = new Harness(turret(90), armoured);
    sideways.wait(0.5);
    expect(sideways.events('hit')[0]).toMatchObject({ damage: 20, side: 'left' });

    const shielded = new Harness(turret(90), { chassis: 'chassis_m', drive: 'wheels', slots: { left: 'shield' } });
    shielded.call('shield', 'on');
    expect(shielded.call('shield', 'is_on')).toBe(true);
    shielded.wait(0.5);
    expect(shielded.events('hit')[0]).toMatchObject({ damage: 4, shielded: true });
  });

  it('the shield drains 8 energy/s and drops when empty', () => {
    const h = new Harness(makeLevel(), { chassis: 'chassis_s', drive: 'wheels', slots: { centre: 'battery' } });
    const sh = new Harness(makeLevel(), { chassis: 'chassis_m', drive: 'wheels', slots: { left: 'shield' } });
    void h;
    sh.call('shield', 'on');
    const e = sh.p.energy;
    sh.wait(1);
    expect(e - sh.p.energy).toBeCloseTo(8 - 2, 0);
    sh.wait(10);
    expect(sh.p.shield).toBe(false);
    expect(sh.events('shield').map((s) => s.on)).toEqual([true, false]);
    expect(sh.events('low_energy')).toHaveLength(1);
    sh.p.energy = 0.5;
    expect(() => sh.call('shield', 'on')).toThrow(expect.objectContaining({ errorName: 'OutOfEnergy' }));
  });

  it('batteries recharge over time up to capacity', () => {
    const h = new Harness(makeLevel(), { chassis: 'chassis_m', drive: 'wheels', slots: { centre: 'battery' } });
    expect(h.call('battery', 'level')).toBe(100);
    h.p.energy = 50;
    h.wait(5);
    expect(h.p.energy).toBeCloseTo(50 + 3 * 5, 0); // chassis 2/s + battery 1/s
    expect(h.call('battery', 'level')).toBe(65);
  });

  it('ram spikes hurt what they drive into, scaled by speed', () => {
    const level = makeLevel({ enemies: [enemy('d', 'static', 600, 350)] });
    const h = new Harness(level, { chassis: 'chassis_s', drive: 'wheels', slots: { front: 'ram' } });
    h.call('drive', 'forward', 300, true);
    const hits = h.events('hit').filter((e) => e.targetId === 'd');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.damage).toBeGreaterThan(20);
    expect(hits[0]!.damage).toBeLessThanOrEqual(25);
    // Pressing against it at a standstill does nothing more.
    h.call('drive', 'forward', 50, true);
    expect(h.events('hit').filter((e) => e.targetId === 'd')).toHaveLength(1);
    // No ram, no damage.
    const plain = new Harness(level);
    plain.call('drive', 'forward', 300, true);
    expect(plain.events('hit')).toHaveLength(0);
  });

  it('tracks shove wheeled bots; wheels cannot shove tracks', () => {
    const level = makeLevel({
      enemies: [enemy('w', 'static', 600, 520, { design: { chassis: 'chassis_s', drive: 'wheels', slots: {} } })],
    });
    const tank = new Harness(level, { chassis: 'chassis_s', drive: 'tracks', slots: {} });
    tank.call('drive', 'forward', 150, true);
    expect(tank.bot('w').y).toBeLessThan(500);
    expect(tank.p.y).toBeCloseTo(450, 0);
    const car = new Harness(level);
    const moved = car.call('drive', 'forward', 150, true) as number;
    expect(moved).toBeLessThan(150);
  });
});

describe('objectives, time and stars', () => {
  it('reach the flag: win with stars for time and damage', () => {
    const level = makeLevel({
      objectives: [{ type: 'reach', id: 'flag', label: 'Flag', target: { x: 600, y: 400 }, radius: 30 }],
    });
    const h = new Harness(level);
    expect(h.call('drive', 'forward', 300, true)).toBe('MATCH_OVER');
    const r = h.m.result();
    expect(r).toMatchObject({ won: true, reason: 'objectives_complete', stars: 3, starFlags: [true, true, true] });
    expect(r.objectives[0]).toMatchObject({ progress: 1, total: 1, done: true });
    expect(h.events('marker')).toEqual([{ type: 'marker', markerId: 'flag', state: 'reached' }]);
    expect(r.seconds).toBeLessThan(2);
  });

  it('waypoints must be visited in order', () => {
    const level = makeLevel({
      objectives: [{ type: 'waypoints', id: 'w', label: 'W', points: [{ x: 600, y: 400 }, { x: 600, y: 500 }], radius: 25 }],
    });
    const h = new Harness(level);
    h.call('drive', 'forward', 100, true); // passes point 2 first: does not count
    expect(h.events('marker')).toHaveLength(0);
    h.call('drive', 'forward', 100, true);
    expect(h.events('marker').map((e) => e.markerId)).toEqual(['w.1']);
    expect(h.call('drive', 'backward', 100, true)).toBe('MATCH_OVER');
    expect(h.m.result().won).toBe(true);
  });

  it('collect cores in any order; collected cores leave the radar', () => {
    const level = makeLevel({
      objectives: [{ type: 'collect', id: 'c', label: 'C', items: [{ x: 600, y: 400 }, { x: 600, y: 700 }], radius: 25 }],
    });
    const h = new Harness(level, { chassis: 'chassis_m', drive: 'wheels', slots: { front: 'radar' } });
    h.call('drive', 'forward', 200, true);
    expect((h.call('radar', 'scan') as unknown[]).length).toBe(1);
    const objEvents = h.events('objective').filter((e) => e.progress === 1);
    expect(objEvents).toHaveLength(1);
    expect(h.call('drive', 'backward', 300, true)).toBe('MATCH_OVER');
    expect(h.m.result().won).toBe(true);
  });

  it('survive completes when its time is reached', () => {
    const level = makeLevel({ objectives: [{ type: 'survive', id: 's', label: 'S', seconds: 3 }] });
    const h = new Harness(level);
    h.finish();
    expect(h.m.tick).toBe(90);
    expect(h.m.result()).toMatchObject({ won: true, seconds: 3 });
    expect(h.events('objective').at(-1)).toMatchObject({ progress: 3, total: 3, done: true });
  });

  it('time_up ends the match at the time limit; further calls throw MatchOver', () => {
    const level = makeLevel({
      timeLimit: 2,
      objectives: [{ type: 'reach', id: 'f', label: 'F', target: { x: 0, y: 0 }, radius: 1 }],
    });
    const h = new Harness(level);
    expect(h.wait(5)).toBe('MATCH_OVER');
    expect(h.m.tick).toBe(60);
    expect(h.m.result()).toMatchObject({ won: false, reason: 'time_up', stars: 0 });
    expect(h.call('', 'health')).toBe('MATCH_OVER');
    expect(h.frames.at(-1)!.tick).toBe(60);
  });

  it('stars: lines and energy criteria', () => {
    const level = makeLevel({
      objectives: [{ type: 'survive', id: 's', label: 'S', seconds: 1 }],
      stars: [
        { type: 'lines', max: 5, label: '' },
        { type: 'energy', min: 90, label: '' },
      ],
    });
    const ok = new Harness(level, WHEELS_S, 1, 5);
    ok.finish();
    expect(ok.m.result().stars).toBe(3);
    const long = new Harness(level, WHEELS_S, 1, 6);
    long.p.energy = 10;
    long.finish();
    expect(long.m.result()).toMatchObject({ stars: 1, starFlags: [true, false, false] });
  });

  it('abort ends the match and flushes pending output in a final frame', () => {
    const h = new Harness(makeLevel());
    h.wait(0.1);
    h.m.print('Traceback...', 'stderr');
    h.m.abort('script_error');
    h.frames.push(...h.m.takeFrames());
    expect(h.m.finished).toBe(true);
    expect(h.m.result()).toMatchObject({ won: false, reason: 'script_error' });
    expect(h.frames.at(-1)!.events).toEqual([{ type: 'print', text: 'Traceback...', stream: 'stderr' }]);
    expect(h.frames.at(-1)!.tick).toBe(4);
  });

  it('caps print events per tick', () => {
    const h = new Harness(makeLevel());
    for (let i = 0; i < 500; i++) h.m.print(`line ${i}`, 'stdout');
    h.wait(0);
    expect(h.events('print')).toHaveLength(201);
  });
});

describe('enemy behaviours', () => {
  it('turret turns to face the player and fires when lined up', () => {
    const level = makeLevel({ enemies: [enemy('t', 'turret', 600, 300, { spawn: { x: 600, y: 300, heading: 0 } })] });
    const h = new Harness(level);
    h.wait(4);
    expect(h.bot('t').heading).toBeCloseTo(180, 0);
    expect(h.events('muzzle_flash').every((e) => e.botId === 't')).toBe(true);
    expect(h.events('hit').filter((e) => e.targetId === 'player').length).toBeGreaterThanOrEqual(2);
  });

  it('turret ignores a player out of range or behind a wall', () => {
    const map = Array.from({ length: 30 }, (_, r) => (r === 12 ? '#'.repeat(30) : '.'.repeat(30)));
    const h = new Harness(makeLevel({ map, enemies: [enemy('t', 'turret', 600, 300)] }));
    h.wait(3);
    expect(h.events('muzzle_flash')).toHaveLength(0);
  });

  it('chase closes in and shoots', () => {
    const level = makeLevel({ enemies: [enemy('c', 'chase', 200, 200)] });
    const h = new Harness(level);
    const d0 = Math.hypot(h.bot('c').x - h.p.x, h.bot('c').y - h.p.y);
    h.wait(5);
    const d1 = Math.hypot(h.bot('c').x - h.p.x, h.bot('c').y - h.p.y);
    expect(d1).toBeLessThan(d0 - 200);
    expect(h.p.damageTaken).toBeGreaterThan(0);
  });

  it('chase path-finds around a wall', () => {
    const map = Array.from({ length: 20 }, (_, r) => (r === 10 ? '#'.repeat(17) + '...' : '.'.repeat(20)));
    const level = makeLevel(
      { map, spawn: { x: 400, y: 700, heading: 0 }, enemies: [enemy('c', 'chase', 400, 100, { design: { chassis: 'chassis_s', drive: 'wheels', slots: {} } })] },
      20,
      20,
    );
    const h = new Harness(level);
    h.wait(12);
    expect(h.bot('c').y).toBeGreaterThan(440);
  });

  it('patrol follows its route until it sees the player', () => {
    const route = [{ x: 200, y: 200 }, { x: 400, y: 200 }];
    const level = makeLevel({
      spawn: { x: 1000, y: 1000, heading: 0 },
      enemies: [enemy('p', 'patrol', 200, 200, { params: { route } })],
    });
    const h = new Harness(level);
    const xs: number[] = [];
    for (let i = 0; i < 12; i++) {
      h.wait(0.5);
      xs.push(h.bot('p').x);
    }
    expect(Math.max(...xs)).toBeGreaterThan(380);
    expect(Math.min(...xs.slice(4))).toBeLessThan(220);
    expect(h.events('muzzle_flash')).toHaveLength(0);
  });

  it('kamikaze rams the player and explodes', () => {
    const level = makeLevel({
      objectives: [{ type: 'destroy', id: 'k', label: 'K' }],
      enemies: [enemy('k', 'kamikaze', 600, 400, { design: { chassis: 'chassis_s', drive: 'wheels', slots: { front: 'ram' } } })],
    });
    const h = new Harness(level);
    h.wait(4);
    expect(h.events('destroyed')[0]).toMatchObject({ botId: 'k' });
    expect(h.p.damageTaken).toBeGreaterThan(30);
  });

  it('coward flees when hurt', () => {
    const level = makeLevel({ enemies: [enemy('c', 'coward', 600, 400, { params: { fleeBelow: 0.5 } })] });
    const h = new Harness(level);
    h.bot('c').hp = 30;
    h.wait(2);
    expect(h.bot('c').y).toBeLessThan(300);
  });

  it('delay keeps an enemy idle at first', () => {
    const level = makeLevel({ enemies: [enemy('c', 'chase', 200, 200, { params: { delay: 60 } })] });
    const h = new Harness(level);
    h.wait(1.9);
    expect(h.bot('c').x).toBe(200);
  });
});

describe('determinism', () => {
  const busy = makeLevel({
    randomWalls: { options: [[{ x: 400, y: 400, w: 40, h: 120 }], [{ x: 800, y: 300, w: 120, h: 40 }]], count: 1 },
    objectives: [{ type: 'destroy', id: 'all', label: 'All' }],
    enemies: [
      enemy('c', 'chase', 200, 200),
      enemy('t', 'turret', 1000, 300),
      enemy('k', 'kamikaze', 1000, 1000, { design: { chassis: 'chassis_s', drive: 'wheels', slots: {} } }),
      enemy('p', 'patrol', 200, 1000, { params: { route: [{ x: 200, y: 1000 }, { x: 600, y: 1000 }] } }),
    ],
  });
  const script = (h: Harness) => {
    for (let i = 0; i < 20 && !h.m.finished; i++) {
      h.call('drive', 'turn', 37, true);
      if (h.call('blaster', 'ready') === true) h.call('blaster', 'fire');
      h.call('drive', 'forward', 60, true);
    }
    if (!h.m.finished) h.finish();
  };
  const design: BotDesign = { chassis: 'chassis_m', drive: 'wheels', slots: { front: 'blaster', centre: 'battery' } };

  it('same seed and inputs give identical frames', () => {
    const a = new Harness(busy, design, 42);
    const b = new Harness(busy, design, 42);
    script(a);
    script(b);
    expect(a.frames.length).toBeGreaterThan(100);
    expect(JSON.stringify(b.frames)).toBe(JSON.stringify(a.frames));
    expect(b.m.result()).toEqual(a.m.result());
  });
});
