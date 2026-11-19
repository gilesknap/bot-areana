/**
 * Part catalogue TYPES. The data itself lives in src/parts/catalogue.ts and the Python API
 * spec in src/parts/api.ts.
 */

export type ChassisId = 'chassis_s' | 'chassis_m' | 'chassis_l' | 'turret_base';

/** Mount points on a chassis. The drive train has its own dedicated mount (BotDesign.drive). */
export type SlotId = 'front' | 'rear' | 'left' | 'right' | 'centre';
export type DirectionalSlot = Exclude<SlotId, 'centre'>;

export const SLOT_IDS: readonly SlotId[] = ['front', 'rear', 'left', 'right', 'centre'];

/** Facing of each directional slot relative to the bot's heading, in degrees. */
export const SLOT_ANGLE: Readonly<Record<DirectionalSlot, number>> = {
  front: 0,
  right: 90,
  rear: 180,
  left: -90,
};

export type DriveId = 'wheels' | 'tracks' | 'hover' | 'pivot';
export type PartId =
  | DriveId
  | 'rangefinder'
  | 'radar'
  | 'gps'
  | 'bump'
  | 'blaster'
  | 'ram'
  | 'mine_dropper'
  | 'armour'
  | 'shield'
  | 'battery'
  | 'battery_plus';

/** Anything a level can unlock. */
export type UnlockId = PartId | ChassisId;

export type PartCategory = 'locomotion' | 'sensor' | 'offense' | 'defense' | 'core';

export type Terrain = 'floor' | 'wall' | 'lava' | 'water' | 'pit' | 'rough';

export interface TerrainEffect {
  /** false = blocks movement like a wall. */
  passable: boolean;
  /** Multiplier on top speed while the bot's centre is on this terrain. */
  speedFactor: number;
  /** Hull damage per simulated second while on it. */
  damagePerSecond: number;
  /** Entering it destroys the bot (pits for ground drives). */
  fatal: boolean;
}

export interface DriveStats {
  /** cm/s on floor at or below refMass. */
  topSpeed: number;
  /** degrees/s when turning on the spot. */
  turnRate: number;
  /** Total bot mass (kg) the drive moves at full speed; heavier bots are slower. */
  refMass: number;
  /** cm/s^2 */
  accel: number;
  /** 0 = stops dead, close to 1 = keeps sliding (hover momentum). */
  drift: number;
  /** Can shove lighter bots out of the way. */
  pushes: boolean;
  /** Energy per second while moving or turning. */
  energyPerSecond: number;
  terrain: Readonly<Record<Exclude<Terrain, 'wall'>, TerrainEffect>>;
}

export interface SensorStats {
  /** Max range in cm (rangefinder returns this if nothing is in range). */
  range: number;
  /** Energy per read. */
  energyPerRead: number;
}

export interface BlasterStats {
  damage: number;
  /** seconds between shots */
  cooldown: number;
  energyPerShot: number;
  /** cm/s */
  projectileSpeed: number;
  /** cm before the bolt fizzles */
  range: number;
}

export interface RamStats {
  /** Damage dealt when hitting something at full top speed (scaled by impact speed). */
  damage: number;
}

export interface ArmourStats {
  /** Fraction of damage removed for hits arriving on the fitted side (0.5 = half damage). */
  reduction: number;
}

export interface ShieldStats {
  /** Fraction of ALL incoming damage removed while on. */
  reduction: number;
  energyPerSecond: number;
}

export interface BatteryStats {
  /** Extra energy capacity. */
  capacity: number;
  /** Extra recharge, energy per second. */
  recharge: number;
}

export interface PartDef {
  id: PartId;
  name: string;
  category: PartCategory;
  /** kg */
  weight: number;
  /** W, counted against the level's power budget. */
  power: number;
  /** One-line description for the parts bin / tooltip. */
  blurb: string;
  /** Slots this part may be fitted to (locomotion parts use BotDesign.drive instead). */
  slots: readonly SlotId[];
  /** At most one per bot (its Python name is the part name, e.g. bot.blaster). */
  unique: boolean;
  /** Not usable by the player (enemy-only hardware). */
  enemyOnly?: boolean;
  /** Shown greyed out as "LATER"; not functional in v1. */
  comingSoon?: boolean;
  drive?: DriveStats;
  sensor?: SensorStats;
  blaster?: BlasterStats;
  ram?: RamStats;
  armour?: ArmourStats;
  shield?: ShieldStats;
  battery?: BatteryStats;
}

export interface ChassisDef {
  id: ChassisId;
  name: string;
  size: 'S' | 'M' | 'L' | 'turret';
  /** Collision circle radius, cm. */
  radius: number;
  /** kg (counts toward total weight) */
  weight: number;
  /** Max total weight including the chassis itself. */
  maxWeight: number;
  hp: number;
  /** Built-in energy capacity and recharge (a battery adds to these). */
  energy: number;
  recharge: number;
  slots: readonly SlotId[];
  enemyOnly?: boolean;
}

/** A bot as built in the Workshop. Only fitted parts appear on the Python `bot` object. */
export interface BotDesign {
  chassis: ChassisId;
  /** null only for static enemy hardware. */
  drive: DriveId | null;
  slots: Partial<Record<SlotId, PartId>>;
}

/** Derived numbers for the Workshop meters and the sim. */
export interface BotStats {
  weight: number;
  maxWeight: number;
  power: number;
  /** cm/s on floor after weight penalty */
  topSpeed: number;
  turnRate: number;
  hp: number;
  energyCapacity: number;
  recharge: number;
  radius: number;
}

export type DesignIssue =
  | { kind: 'no_drive' }
  | { kind: 'overweight'; weight: number; limit: number }
  | { kind: 'over_power'; power: number; limit: number }
  | { kind: 'slot_missing'; slot: SlotId; part: PartId }
  | { kind: 'wrong_slot'; slot: SlotId; part: PartId }
  | { kind: 'duplicate'; part: PartId }
  | { kind: 'locked'; part: PartId | ChassisId }
  | { kind: 'unavailable'; part: PartId | ChassisId };
