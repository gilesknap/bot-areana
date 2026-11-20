import type {
  ChassisDef,
  ChassisId,
  DriveStats,
  PartCategory,
  PartDef,
  PartId,
  TerrainEffect,
} from '../shared/parts';
import { PALETTE } from '../shared/palette';

const ok = (speedFactor = 1, damagePerSecond = 0): TerrainEffect => ({
  passable: true,
  speedFactor,
  damagePerSecond,
  fatal: false,
});
const blocked: TerrainEffect = { passable: false, speedFactor: 0, damagePerSecond: 0, fatal: false };
const fatal: TerrainEffect = { passable: true, speedFactor: 1, damagePerSecond: 0, fatal: true };

/** Ground drives: wheels slow right down on rough ground, water blocks, pits destroy. */
const GROUND_TERRAIN: DriveStats['terrain'] = {
  floor: ok(),
  rough: ok(0.4),
  lava: ok(0.8, 25),
  water: blocked,
  pit: fatal,
};

export const CHASSIS: Readonly<Record<ChassisId, ChassisDef>> = {
  chassis_s: {
    id: 'chassis_s',
    name: 'Chassis S',
    size: 'S',
    radius: 18,
    weight: 6,
    maxWeight: 30,
    hp: 60,
    energy: 40,
    recharge: 2,
    slots: ['front', 'rear', 'centre'],
  },
  chassis_m: {
    id: 'chassis_m',
    name: 'Chassis M',
    size: 'M',
    radius: 24,
    weight: 10,
    maxWeight: 50,
    hp: 100,
    energy: 50,
    recharge: 2,
    slots: ['front', 'rear', 'left', 'right', 'centre'],
  },
  chassis_l: {
    id: 'chassis_l',
    name: 'Chassis L',
    size: 'L',
    radius: 30,
    weight: 16,
    maxWeight: 80,
    hp: 160,
    energy: 60,
    recharge: 2,
    slots: ['front', 'rear', 'left', 'right', 'centre'],
  },
  turret_base: {
    id: 'turret_base',
    name: 'Turret base',
    size: 'turret',
    radius: 22,
    weight: 40,
    maxWeight: 100,
    hp: 40,
    energy: 100,
    recharge: 10,
    slots: ['front', 'centre'],
    enemyOnly: true,
  },
};

/**
 * Distances and speeds here are world units (see src/shared/geometry.ts); the player sees them
 * x CM_PER_UNIT in cm: wheels 175 cm/s, tracks 110, hover 275, rangefinder 750 cm, radar 600,
 * blaster 900, bolts 750 cm/s.
 */
export const PARTS: Readonly<Record<PartId, PartDef>> = {
  // ---- Locomotion (BotDesign.drive) ----
  wheels: {
    id: 'wheels',
    name: 'Wheels',
    category: 'locomotion',
    weight: 8,
    power: 0,
    blurb: 'Medium speed, turns on the spot.',
    slots: [],
    unique: true,
    drive: {
      topSpeed: 140,
      turnRate: 180,
      refMass: 30,
      accel: 600,
      drift: 0,
      pushes: false,
      energyPerSecond: 1,
      terrain: GROUND_TERRAIN,
    },
  },
  tracks: {
    id: 'tracks',
    name: 'Tracks',
    category: 'locomotion',
    weight: 14,
    power: 0,
    blurb: 'Slow and heavy. Pushes others aside and ignores rough ground.',
    slots: [],
    unique: true,
    drive: {
      topSpeed: 88,
      turnRate: 120,
      refMass: 60,
      accel: 300,
      drift: 0,
      pushes: true,
      energyPerSecond: 1.5,
      terrain: { ...GROUND_TERRAIN, rough: ok(1) },
    },
  },
  hover: {
    id: 'hover',
    name: 'Hover',
    category: 'locomotion',
    weight: 10,
    power: 2,
    blurb: 'Fast but drifts. Floats over water and pits.',
    slots: [],
    unique: true,
    drive: {
      topSpeed: 220,
      turnRate: 240,
      refMass: 30,
      accel: 250,
      drift: 0.85,
      pushes: false,
      energyPerSecond: 2,
      terrain: { floor: ok(), rough: ok(0.8), lava: ok(1, 10), water: ok(), pit: ok() },
    },
  },
  pivot: {
    id: 'pivot',
    name: 'Turret pivot',
    category: 'locomotion',
    weight: 0,
    power: 0,
    blurb: 'Rotates on the spot; cannot move.',
    slots: [],
    unique: true,
    enemyOnly: true,
    drive: {
      topSpeed: 0,
      turnRate: 90,
      refMass: 1000,
      accel: 0,
      drift: 0,
      pushes: false,
      energyPerSecond: 0,
      terrain: GROUND_TERRAIN,
    },
  },

  // ---- Sensors ----
  rangefinder: {
    id: 'rangefinder',
    name: 'Rangefinder',
    category: 'sensor',
    weight: 2,
    power: 1,
    blurb: 'Measures the distance to the nearest solid thing it points at.',
    slots: ['front', 'rear', 'left', 'right'],
    unique: false,
    sensor: { range: 600, energyPerRead: 0 },
  },
  radar: {
    id: 'radar',
    name: 'Radar',
    category: 'sensor',
    weight: 3,
    power: 2,
    blurb: 'Sweeps all around and lists what it finds.',
    slots: ['front', 'rear', 'left', 'right'],
    unique: true,
    sensor: { range: 480, energyPerRead: 1 },
  },
  gps: {
    id: 'gps',
    name: 'Compass/GPS',
    category: 'sensor',
    weight: 1,
    power: 1,
    blurb: 'Knows where the bot is and which way it faces.',
    slots: ['front', 'rear', 'left', 'right'],
    unique: true,
    sensor: { range: 0, energyPerRead: 0 },
  },
  bump: {
    id: 'bump',
    name: 'Bump sensor',
    category: 'sensor',
    weight: 1,
    power: 0,
    blurb: 'Tells you when that side has touched something.',
    slots: ['front', 'rear', 'left', 'right'],
    unique: false,
    sensor: { range: 0, energyPerRead: 0 },
  },

  // ---- Offense ----
  blaster: {
    id: 'blaster',
    name: 'Blaster',
    category: 'offense',
    weight: 6,
    power: 4,
    blurb: 'Fires an energy bolt. Needs a moment to cool down between shots.',
    slots: ['front', 'rear'],
    unique: true,
    blaster: { damage: 20, cooldown: 1, energyPerShot: 5, projectileSpeed: 600, range: 720 },
  },
  ram: {
    id: 'ram',
    name: 'Ram spike',
    category: 'offense',
    weight: 5,
    power: 0,
    blurb: 'Hurts whatever you drive into. Faster hits hurt more.',
    slots: ['front', 'rear'],
    unique: false,
    ram: { damage: 25 },
  },
  mine_dropper: {
    id: 'mine_dropper',
    name: 'Mine dropper',
    category: 'offense',
    weight: 5,
    power: 2,
    blurb: 'Leaves surprises behind you.',
    slots: ['rear'],
    unique: true,
    comingSoon: true,
  },

  // ---- Defense ----
  armour: {
    id: 'armour',
    name: 'Armour plate',
    category: 'defense',
    weight: 8,
    power: 0,
    blurb: 'Halves damage arriving on that side. Heavy.',
    slots: ['front', 'rear', 'left', 'right'],
    unique: false,
    armour: { reduction: 0.5 },
  },
  shield: {
    id: 'shield',
    name: 'Shield gen',
    category: 'defense',
    weight: 5,
    power: 3,
    blurb: 'Blocks most damage from every side while on. Drains energy fast.',
    slots: ['left', 'right'],
    unique: true,
    shield: { reduction: 0.8, energyPerSecond: 8 },
  },

  // ---- Core ----
  battery: {
    id: 'battery',
    name: 'Battery',
    category: 'core',
    weight: 5,
    power: 0,
    blurb: 'More energy, faster recharge.',
    slots: ['centre'],
    unique: true,
    battery: { capacity: 50, recharge: 1 },
  },
  battery_plus: {
    id: 'battery_plus',
    name: 'Battery+',
    category: 'core',
    weight: 8,
    power: 0,
    blurb: 'A lot more energy and recharge.',
    slots: ['centre'],
    unique: true,
    battery: { capacity: 120, recharge: 2 },
  },
};

/** UI colour per category (Main.dc.html glyph colours). */
export const CATEGORY_COLOUR: Readonly<Record<PartCategory, string>> = {
  locomotion: PALETTE.cyan,
  sensor: PALETTE.signal,
  offense: PALETTE.alert,
  defense: PALETTE.amber,
  core: PALETTE.core,
};

export const CATEGORY_LABEL: Readonly<Record<PartCategory, string>> = {
  locomotion: 'Locomotion',
  sensor: 'Sensors',
  offense: 'Offense',
  defense: 'Defense',
  core: 'Core',
};

/** Parts the player can ever fit (excludes enemy-only hardware), in parts-bin order. */
export const PLAYER_PARTS: readonly PartDef[] = Object.values(PARTS).filter((p) => !p.enemyOnly);
export const PLAYER_CHASSIS: readonly ChassisDef[] = Object.values(CHASSIS).filter((c) => !c.enemyOnly);

export function isChassisId(id: string): id is ChassisId {
  return id in CHASSIS;
}
