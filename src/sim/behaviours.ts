/**
 * Enemy AI. Each behaviour drives its bot only through the same levers the player's API
 * uses (drive commands, blaster fire, shield), so a Python opponent could replace it later.
 */
import type { Vec2 } from '../shared/geometry';
import { distance, headingTo, normaliseBearing, TICK_RATE } from '../shared/geometry';
import type { EnemyDef } from '../shared/level';
import { SLOT_ANGLE, type DirectionalSlot } from '../shared/parts';
import { PARTS } from '../parts';
import type { Arena } from './arena';
import type { SimBot } from './bot';
import type { Rng } from './rng';

/** What a behaviour may ask of the match. */
export interface BehaviourWorld {
  readonly tick: number;
  readonly arena: Arena;
  readonly player: SimBot;
  readonly rng: Rng;
  /** Try to fire the bot's blaster; false if cooling down or out of energy. */
  fire(bot: SimBot): boolean;
  /** No wall between the two points (bots don't block sight). */
  lineOfSight(from: Vec2, to: Vec2): boolean;
  /**
   * A body of this radius could drive straight from one point to the other without hitting a
   * wall or, for ground drives, crossing water, a pit or lava.
   */
  clearPath(from: Vec2, to: Vec2, radius: number, hover: boolean): boolean;
  /** Kamikaze detonation. */
  explode(bot: SimBot): void;
}

const DEFAULT_SIGHT: Record<EnemyDef['behaviour'], number> = {
  static: 0,
  turret: 450,
  patrol: 250,
  chase: 5000,
  kamikaze: 400,
  coward: 5000,
};
const DEFAULT_FIRE_RANGE = 400;
const REPATH_TICKS = 15;
/** Aim tolerance in degrees before firing. */
const AIM_TOLERANCE = 5;

export class EnemyController {
  private readonly sight: number;
  private readonly fireRange: number;
  private readonly fleeBelow: number;
  private readonly fireDelayTicks: number;
  private readonly delay: number;
  private readonly route: Vec2[];
  private readonly blasterSlot: DirectionalSlot | undefined;
  private routeIndex = 0;
  private engaged = false;
  private nextShot = 0;
  private path: Vec2[] = [];
  private pathTarget: Vec2 | null = null;
  private pathAge = 0;
  /** Escape manoeuvre after getting stuck: reverse, then turn. */
  private escape: Array<() => void> = [];

  constructor(
    readonly bot: SimBot,
    readonly def: EnemyDef,
  ) {
    const p = def.params ?? {};
    const blasterRange = PARTS.blaster.blaster!.range;
    this.fireRange = Math.min(p.fireRange ?? DEFAULT_FIRE_RANGE, blasterRange);
    this.sight = p.sightRange ?? Math.max(DEFAULT_SIGHT[def.behaviour], def.behaviour === 'turret' ? this.fireRange : 0);
    this.fleeBelow = p.fleeBelow ?? 0.3;
    // fireDelay is on top of the blaster's own cooldown.
    this.fireDelayTicks = Math.round(((p.fireDelay ?? 0) + PARTS.blaster.blaster!.cooldown) * TICK_RATE);
    this.delay = p.delay ?? 0;
    this.route = p.route ?? [];
    const slot = bot.slotOf('blaster');
    this.blasterSlot = slot && slot !== 'centre' ? slot : undefined;
  }

  think(w: BehaviourWorld): void {
    const { bot } = this;
    if (!bot.alive || w.tick < this.delay) return;
    const player = w.player;
    if (!player.alive) {
      bot.command = null;
      return;
    }
    const d = distance(bot, player);
    const sees = d <= this.sight && w.lineOfSight(bot, player);

    switch (this.def.behaviour) {
      case 'static':
        return;
      case 'turret':
        if (sees) this.aim(w, player);
        else bot.command = null;
        return;
      case 'patrol':
        if (sees) this.engaged = true;
        else if (d > this.sight * 1.5) this.engaged = false;
        if (this.engaged) this.fight(w, sees);
        else this.patrol(w);
        return;
      case 'chase':
        if (sees || d <= this.sight) this.fight(w, sees);
        else this.patrol(w);
        return;
      case 'coward':
        if (bot.hp < bot.maxHp * this.fleeBelow) this.flee(w);
        else if (d <= this.sight) this.fight(w, sees);
        else this.patrol(w);
        return;
      case 'kamikaze':
        if (d <= bot.radius + player.radius + 8) {
          w.explode(bot);
          return;
        }
        if (sees) this.engaged = true;
        if (this.engaged) this.driveTo(w, player, 0);
        else this.patrol(w);
        return;
    }
  }

  /** Close to blaster range (or contact, for ram bots), face the player and shoot. */
  private fight(w: BehaviourWorld, sees: boolean): void {
    const { bot } = this;
    const player = w.player;
    const d = distance(bot, player);
    const standOff = this.blasterSlot ? Math.min(this.fireRange * 0.6, 220) : 0;
    if (!sees || d > standOff + 20) this.driveTo(w, player, standOff);
    else this.aim(w, player);
    if (sees && this.blasterSlot) this.tryFire(w, player);
  }

  /** Turn the blaster toward the target; fire when lined up. */
  private aim(w: BehaviourWorld, target: Vec2): void {
    const b = this.aimBearing(target);
    this.bot.command = Math.abs(b) > 1 ? { kind: 'turn', remaining: b } : null;
    this.tryFire(w, target);
  }

  private aimBearing(target: Vec2): number {
    const offset = this.blasterSlot ? SLOT_ANGLE[this.blasterSlot] : 0;
    return normaliseBearing(headingTo(this.bot, target) - this.bot.heading - offset);
  }

  private tryFire(w: BehaviourWorld, target: Vec2): void {
    if (!this.blasterSlot || w.tick < this.nextShot) return;
    if (distance(this.bot, target) > this.fireRange) return;
    if (Math.abs(this.aimBearing(target)) > AIM_TOLERANCE) return;
    if (w.fire(this.bot)) this.nextShot = w.tick + this.fireDelayTicks;
  }

  private patrol(w: BehaviourWorld): void {
    if (this.route.length === 0) {
      this.bot.command = null;
      return;
    }
    const target = this.route[this.routeIndex % this.route.length]!;
    if (distance(this.bot, target) < 15) this.routeIndex = (this.routeIndex + 1) % this.route.length;
    this.driveTo(w, this.route[this.routeIndex]!, 0);
  }

  private flee(w: BehaviourWorld): void {
    const { bot } = this;
    const away = headingTo(w.player, bot);
    const r = (away * Math.PI) / 180;
    const pad = bot.radius + 10;
    const target = {
      x: Math.min(w.arena.width - pad, Math.max(pad, bot.x + Math.sin(r) * 200)),
      y: Math.min(w.arena.height - pad, Math.max(pad, bot.y - Math.cos(r) * 200)),
    };
    this.driveTo(w, target, 0);
  }

  /** Head for a point, path-finding round walls, with a reverse-and-turn escape when stuck. */
  private driveTo(w: BehaviourWorld, target: Vec2, stopWithin: number): void {
    const { bot } = this;
    if (bot.immovable) return;
    if (this.escape.length > 0) {
      if (bot.command === null) this.escape.shift()!();
      return;
    }
    const cmd = bot.command;
    if (cmd?.kind === 'goto' && cmd.stalled >= 20) {
      const turn = w.rng() < 0.5 ? -90 : 90;
      this.escape = [() => (bot.command = { kind: 'turn', remaining: turn })];
      bot.command = { kind: 'move', dir: -1, distance: 30, moved: 0, along: back(bot.heading), stalled: 0 };
      this.path = [];
      return;
    }

    let waypoint = target;
    let within = stopWithin;
    if (!w.clearPath(bot, target, bot.radius, bot.hover)) {
      this.pathAge++;
      const moved = this.pathTarget ? distance(this.pathTarget, target) > 40 : true;
      if (this.path.length === 0 || moved || this.pathAge > REPATH_TICKS) {
        this.path = w.arena.findPath(bot, target, bot.hover);
        this.pathTarget = { x: target.x, y: target.y };
        this.pathAge = 0;
      }
      while (this.path.length > 1 && distance(bot, this.path[0]!) < 20) this.path.shift();
      if (this.path.length > 0) {
        waypoint = this.path[0]!;
        within = 0;
      }
    }
    if (cmd?.kind === 'goto') {
      cmd.target = waypoint;
      cmd.stopWithin = within;
    } else {
      bot.command = { kind: 'goto', target: waypoint, stopWithin: within, stalled: 0 };
    }
  }
}

function back(heading: number): Vec2 {
  const r = (heading * Math.PI) / 180;
  return { x: -Math.sin(r), y: Math.cos(r) };
}
