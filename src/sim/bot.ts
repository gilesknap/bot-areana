/** A bot in the sim: state, derived stats, and its current drive command. */
import type { Pose, Vec2 } from '../shared/geometry';
import type { Team } from '../shared/frames';
import type { BehaviourId } from '../shared/level';
import type { BotDesign, BotStats, DirectionalSlot, DriveStats, PartId, SlotId } from '../shared/parts';
import { computeStats, PARTS } from '../parts';

/**
 * What the drive train is doing. 'move' and 'turn' are the player API commands;
 * 'goto' is used by enemy behaviours (turn toward a point while driving to it).
 */
export type DriveCommand =
  | {
      kind: 'move';
      /** +1 forward, -1 backward */
      dir: 1 | -1;
      distance: number;
      moved: number;
      /** Unit vector the move started along (hover keeps it while sliding). */
      along: Vec2;
      stalled: number;
    }
  | { kind: 'turn'; remaining: number }
  | { kind: 'goto'; target: Vec2; stopWithin: number; stalled: number };

/** Ticks without progress before a move gives up ("blocked"). */
export const STALL_TICKS = 10;

export class SimBot {
  readonly stats: BotStats;
  readonly driveStats: DriveStats | undefined;
  readonly maxHp: number;
  x: number;
  y: number;
  heading: number;
  hp: number;
  energy: number;
  shield = false;
  alive = true;
  /** Scalar ground speed (world units/s, >= 0) for wheels/tracks. */
  speed = 0;
  /** Velocity for hover (world units/s). */
  vx = 0;
  vy = 0;
  command: DriveCommand | null = null;
  /** Ticks until the blaster may fire again. */
  cooldown = 0;
  /** Latched bump per side, set once per new contact and cleared when read. */
  readonly bumped: Record<DirectionalSlot, boolean> = { front: false, right: false, rear: false, left: false };
  /** Sides touching something this tick, and last tick (a contact that carries on is not a new bump). */
  contact = new Set<DirectionalSlot>();
  prevContact = new Set<DirectionalSlot>();
  /** Speed just before this tick's collisions (for ram damage). */
  impactSpeed = 0;
  /** Ticks until this bot's ram can hurt again. */
  ramCooldown = 0;
  damageTaken = 0;
  /** Energy below 20%: low_energy fired, re-armed above 30%. */
  lowEnergy = false;
  /** Terrain under the centre last tick (for hazard events). */
  lastTerrain: string = 'floor';
  /** Displacement achieved in the last physics tick (for blocked detection). */
  lastMove: Vec2 = { x: 0, y: 0 };

  constructor(
    readonly id: string,
    readonly team: Team,
    readonly design: BotDesign,
    start: Pose,
    readonly behaviour?: BehaviourId,
    /** Behaviour tuning multiplier on top speed. */
    readonly speedFactor = 1,
  ) {
    this.stats = computeStats(design);
    this.driveStats = design.drive ? PARTS[design.drive].drive : undefined;
    this.maxHp = this.stats.hp;
    this.hp = this.maxHp;
    this.energy = this.stats.energyCapacity;
    this.x = start.x;
    this.y = start.y;
    this.heading = start.heading;
  }

  get radius(): number {
    return this.stats.radius;
  }

  get hover(): boolean {
    return this.design.drive === 'hover';
  }

  /** Cannot be pushed: turrets, drive-less hardware. */
  get immovable(): boolean {
    return !this.driveStats || this.driveStats.topSpeed === 0;
  }

  get topSpeed(): number {
    return this.stats.topSpeed * this.speedFactor;
  }

  /** Current speed in world units/s whatever the drive. */
  get currentSpeed(): number {
    return this.hover ? Math.hypot(this.vx, this.vy) : this.speed;
  }

  get moving(): boolean {
    return this.command !== null || this.currentSpeed > 2;
  }

  /** Slot a part is fitted to, if any. */
  slotOf(part: PartId): SlotId | undefined {
    for (const [slot, p] of Object.entries(this.design.slots) as Array<[SlotId, PartId]>) {
      if (p === part) return slot;
    }
    return undefined;
  }

  partIn(slot: SlotId): PartId | undefined {
    return this.design.slots[slot];
  }
}
