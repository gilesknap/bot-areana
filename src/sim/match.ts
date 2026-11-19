/**
 * One deterministic match. The Python runtime drives it synchronously: each API call steps
 * fixed 1/30 s ticks until the action resolves, and every tick produces exactly one Frame.
 */
import type { FittedApi, ScanResult } from '../shared/api';
import { BotApiError, MatchOver } from '../shared/errors';
import type { BotFrame, Frame, ProjectileFrame, SimEvent, WorldInit } from '../shared/frames';
import type { Rect, Vec2 } from '../shared/geometry';
import {
  distance,
  headingTo,
  headingVector,
  normaliseBearing,
  normaliseHeading,
  TICK_RATE,
  TICK_SECONDS,
} from '../shared/geometry';
import type { LevelDef } from '../shared/level';
import { MAX_MATCH_SECONDS } from '../shared/level';
import { SLOT_ANGLE, type DirectionalSlot } from '../shared/parts';
import type { MatchOptions, PyValue, SimMatch } from '../shared/protocol';
import type { EndReason, MatchResult } from '../shared/result';
import { fittedApi, PARTS } from '../parts';
import { Arena } from './arena';
import { EnemyController, type BehaviourWorld } from './behaviours';
import { SimBot, STALL_TICKS, type DriveCommand } from './bot';
import { circleRectPush, inflate, rayCircle, rayRect, round1, round2, sideFor } from './geom';
import { Objectives, starMet } from './objectives';
import { mulberry32, type Rng } from './rng';

interface Projectile {
  id: number;
  x: number;
  y: number;
  heading: number;
  owner: SimBot;
  travelled: number;
  damage: number;
  speed: number;
  range: number;
}

const DT = TICK_SECONDS;
/** Max print events per tick (bounds memory for print-in-a-loop scripts). */
const PRINT_CAP = 200;
/** Ticks between ram hits by the same bot. */
const RAM_COOLDOWN = 15;
/** Below this fraction of top speed a ram does nothing. */
const RAM_MIN_SPEED = 0.2;
const KAMIKAZE = { damage: 40, radius: 100 };
const LOW_ENERGY = 0.2;
const LOW_ENERGY_RESET = 0.3;
/** Progress below this (cm per tick) counts as "not moving" for blocked detection. */
const MIN_PROGRESS = 0.1;

export class Match implements SimMatch, BehaviourWorld {
  readonly world: WorldInit;
  readonly arena: Arena;
  readonly rng: Rng;
  readonly player: SimBot;
  readonly bots: SimBot[];
  private readonly level: LevelDef;
  private readonly controllers: EnemyController[];
  private readonly objectives: Objectives;
  private readonly fitted: FittedApi[];
  private readonly scriptLines: number;
  private readonly limitTicks: number;
  private readonly destroyed = new Set<string>();
  private projectiles: Projectile[] = [];
  private nextProjectileId = 1;
  /** Events for the frame being built (calls between ticks land in the next frame). */
  private events: SimEvent[] = [];
  private printsThisTick = 0;
  private frames: Frame[] = [];
  private _tick = 0;
  private endReason: EndReason | null = null;

  constructor(opts: MatchOptions) {
    const { level, design, seed } = opts;
    this.level = level;
    this.scriptLines = opts.scriptLines;
    this.arena = new Arena(level, mulberry32(seed));
    this.rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    this.player = new SimBot('player', 'player', design, level.spawn);
    this.bots = [this.player];
    this.controllers = [];
    for (const e of level.enemies) {
      const bot = new SimBot(e.id, 'enemy', e.design, e.spawn, e.behaviour, e.params?.speedFactor ?? 1);
      this.bots.push(bot);
      this.controllers.push(new EnemyController(bot, e));
    }
    this.fitted = fittedApi(design);
    this.objectives = new Objectives(level);
    const seconds = Math.min(level.timeLimit ?? MAX_MATCH_SECONDS, MAX_MATCH_SECONDS);
    this.limitTicks = Math.round(seconds * TICK_RATE);

    this.world = {
      walls: this.arena.walls.map((w) => ({ ...w })),
      width: this.arena.width,
      height: this.arena.height,
      bots: this.bots.map((b) => ({
        id: b.id,
        team: b.team,
        design: b.design,
        ...(b.behaviour ? { behaviour: b.behaviour } : {}),
        start: { x: b.x, y: b.y, heading: b.heading },
        maxHp: b.maxHp,
        maxEnergy: b.stats.energyCapacity,
      })),
      markers: this.arena.markers,
      seed,
    };
    this.events.push(...this.objectives.initialEvents());
    this.pushFrame();
  }

  get tick(): number {
    return this._tick;
  }

  get finished(): boolean {
    return this.endReason !== null;
  }

  // ---- SimMatch ---------------------------------------------------------------------------

  call(attr: string, method: string, args: PyValue[]): PyValue {
    if (this.finished) throw new MatchOver();
    if (attr === '') return this.callCore(method, args);
    const f = this.fitted.find((x) => x.attr === attr);
    if (!f) throw new BotApiError('PartNotFitted');
    const p = this.player;
    const slot = f.slot === 'drive' || f.slot === 'centre' ? null : f.slot;

    switch (`${f.part === 'battery_plus' ? 'battery' : f.part}.${method}`) {
      case 'wheels.forward':
      case 'tracks.forward':
      case 'hover.forward':
        return this.move(num(args[0]), args[1] !== false);
      case 'wheels.backward':
      case 'tracks.backward':
      case 'hover.backward':
        return this.move(-num(args[0]), args[1] !== false);
      case 'wheels.turn':
      case 'tracks.turn':
      case 'hover.turn':
        return this.drive({ kind: 'turn', remaining: num(args[0]) }, args[1] !== false, () => null);
      case 'wheels.stop':
      case 'tracks.stop':
      case 'hover.stop':
        p.command = null;
        return this.after(1, null);
      case 'wheels.is_moving':
      case 'tracks.is_moving':
      case 'hover.is_moving':
        return this.after(1, p.command !== null);

      case 'rangefinder.distance': {
        const d = this.rangefind(p, slot ?? 'front');
        this.events.push({ type: 'range', botId: p.id, slot: slot ?? 'front', distance: d });
        return this.after(1, d);
      }
      case 'radar.scan': {
        p.energy = Math.max(0, p.energy - PARTS.radar.sensor!.energyPerRead);
        const range = PARTS.radar.sensor!.range;
        this.events.push({ type: 'scan', botId: p.id, range });
        return this.after(1, this.scan(p, range) as unknown as PyValue);
      }
      case 'gps.position':
        return this.after(1, [round1(p.x), round1(p.y)]);
      case 'gps.heading':
        return this.after(1, round1(p.heading) % 360);
      case 'gps.bearing_to':
        return this.after(1, round1(normaliseBearing(headingTo(p, xy(args)) - p.heading)));
      case 'gps.distance_to':
        return this.after(1, round1(distance(p, xy(args))));
      case 'bump.hit': {
        const side = slot ?? 'front';
        const hit = p.bumped[side];
        p.bumped[side] = false;
        return this.after(1, hit);
      }
      case 'blaster.fire': {
        if (p.cooldown > 0) return this.fail('BlasterNotReady');
        if (p.energy < PARTS.blaster.blaster!.energyPerShot) return this.fail('OutOfEnergy');
        this.fire(p);
        return this.after(1, null);
      }
      case 'blaster.ready':
        return this.after(1, this.blasterReady(p));
      case 'shield.on':
        if (p.energy < 1) return this.fail('OutOfEnergy');
        this.setShield(p, true);
        return this.after(1, null);
      case 'shield.off':
        this.setShield(p, false);
        return this.after(1, null);
      case 'shield.is_on':
        return this.after(1, p.shield);
      case 'battery.level':
        return this.after(1, round1((100 * p.energy) / p.stats.energyCapacity));
    }
    throw new Error(`${attr}.${method}() is not part of the bot API`);
  }

  print(text: string, stream: 'stdout' | 'stderr' | 'log'): void {
    if (this.printsThisTick > PRINT_CAP) return;
    this.printsThisTick++;
    this.events.push(
      this.printsThisTick > PRINT_CAP
        ? { type: 'print', text: '... (too much output this tick, some was skipped)', stream: 'stderr' }
        : { type: 'print', text, stream },
    );
  }

  /**
   * The script ended. Run the match on while something could still change the result (enemies,
   * a survive objective, the bot still moving, shots in flight); otherwise end it straight away.
   */
  finish(): void {
    const waiting = this.bots.some((b) => b.team === 'enemy' && b.alive) || this.level.objectives.some((o) => o.type === 'survive');
    if (!this.finished && waiting) this.print('Your script has finished - your bot will sit still until the match ends.', 'stderr');
    while (!this.finished) {
      if (!waiting && !this.player.moving && this.projectiles.length === 0) {
        this.end('script_ended');
        return;
      }
      this.step();
    }
  }

  abort(reason: 'script_error' | 'watchdog' | 'aborted'): void {
    if (!this.finished) this.end(reason);
  }

  private end(reason: EndReason): void {
    this.endReason = reason;
    // Flush output and events from the last call in a final, frozen frame.
    if (this.events.length > 0) {
      this._tick++;
      this.pushFrame();
    }
  }

  takeFrames(): Frame[] {
    const out = this.frames;
    this.frames = [];
    return out;
  }

  result(): MatchResult {
    const won = this.endReason === 'objectives_complete';
    const p = this.player;
    const seconds = round1(this._tick / TICK_RATE);
    const energyPercent = (100 * p.energy) / p.stats.energyCapacity;
    const inputs = { seconds, damageTaken: p.damageTaken, scriptLines: this.scriptLines, energyPercent };
    const starFlags: [boolean, boolean, boolean] = [
      won,
      won && starMet(this.level.stars[0], inputs),
      won && starMet(this.level.stars[1], inputs),
    ];
    return {
      won,
      reason: this.endReason ?? 'aborted',
      stars: (won ? starFlags.filter(Boolean).length : 0) as MatchResult['stars'],
      starFlags,
      ticks: this._tick,
      seconds,
      damageTaken: round1(p.damageTaken),
      energyLeft: round1(energyPercent),
      objectives: this.objectives.progress(),
    };
  }

  // ---- API helpers ------------------------------------------------------------------------

  private callCore(method: string, args: PyValue[]): PyValue {
    switch (method) {
      case 'log':
        this.print(args.map(String).join(' '), 'log');
        return null;
      case 'wait':
        return this.after(Math.max(1, Math.round(num(args[0]) * TICK_RATE)), null);
      case 'health':
        return this.after(1, Math.ceil(this.player.hp));
      case 'time':
        return this.after(1, round1(this._tick / TICK_RATE));
    }
    throw new Error(`bot.${method}() is not part of the bot API`);
  }

  /** A call that fails still costs its tick (so a retry loop can't freeze the clock), then raises. */
  private fail(error: 'BlasterNotReady' | 'OutOfEnergy'): never {
    this.after(1, null);
    throw new BotApiError(error);
  }

  /** Step `ticks` ticks, then return `value` (read before the ticks passed). */
  private after<T extends PyValue>(ticks: number, value: T): T {
    for (let i = 0; i < ticks; i++) {
      this.step();
      if (this.finished) throw new MatchOver();
    }
    return value;
  }

  private move(signed: number, wait: boolean): PyValue {
    const dir = signed < 0 ? -1 : 1;
    const along = headingVector(this.player.heading);
    const cmd: DriveCommand = {
      kind: 'move',
      dir,
      distance: Math.abs(signed),
      moved: 0,
      along: { x: along.x * dir, y: along.y * dir },
      stalled: 0,
    };
    return this.drive(cmd, wait, () => round1(cmd.kind === 'move' ? cmd.moved : 0));
  }

  /** Start a drive command; with wait, step until it ends (done, blocked or replaced). */
  private drive(cmd: DriveCommand, wait: boolean, result: () => PyValue): PyValue {
    const p = this.player;
    p.command = cmd;
    if (!wait) return this.after(1, null);
    do this.after(1, null);
    while (p.command === cmd);
    return result();
  }

  blasterReady(b: SimBot): boolean {
    return b.cooldown <= 0 && b.energy >= PARTS.blaster.blaster!.energyPerShot;
  }

  /** BehaviourWorld.fire: same rules as the player's blaster.fire(). */
  fire(b: SimBot): boolean {
    const slot = b.slotOf('blaster');
    const stats = PARTS.blaster.blaster!;
    if (!slot || slot === 'centre' || !this.blasterReady(b)) return false;
    b.energy -= stats.energyPerShot;
    b.cooldown = Math.round(stats.cooldown * TICK_RATE);
    const heading = normaliseHeading(b.heading + SLOT_ANGLE[slot]);
    const v = headingVector(heading);
    const x = b.x + v.x * (b.radius + 2);
    const y = b.y + v.y * (b.radius + 2);
    this.projectiles.push({
      id: this.nextProjectileId++,
      x,
      y,
      heading,
      owner: b,
      travelled: 0,
      damage: stats.damage,
      speed: stats.projectileSpeed,
      range: stats.range,
    });
    this.events.push({ type: 'muzzle_flash', botId: b.id, slot, x: round1(x), y: round1(y), heading });
    return true;
  }

  private setShield(b: SimBot, on: boolean): void {
    if (b.shield === on) return;
    b.shield = on;
    this.events.push({ type: 'shield', botId: b.id, on });
  }

  /** Rangefinder: cm from the bot's edge to the first wall or bot along the slot's direction. */
  private rangefind(b: SimBot, slot: DirectionalSlot): number {
    const range = PARTS.rangefinder.sensor!.range;
    const dir = headingVector(b.heading + SLOT_ANGLE[slot]);
    let t = Infinity;
    for (const r of this.arena.solids) t = Math.min(t, rayRect(b, dir, r));
    for (const o of this.bots) if (o !== b && o.alive) t = Math.min(t, rayCircle(b, dir, o, o.radius));
    return round1(Math.min(range, Math.max(0, t - b.radius)));
  }

  private scan(b: SimBot, range: number): ScanResult[] {
    const things: Array<{ kind: ScanResult['kind']; x: number; y: number }> = [];
    for (const o of this.bots) {
      if (o === b || !o.alive) continue;
      things.push({ kind: o.design.chassis === 'turret_base' ? 'turret' : 'bot', x: o.x, y: o.y });
    }
    things.push(...this.objectives.pending());
    return things
      .map((t) => ({ t, d: distance(b, t) }))
      .filter(({ d }) => d <= range)
      .sort((a, c) => a.d - c.d)
      .map(({ t, d }) => ({
        kind: t.kind,
        bearing: round1(normaliseBearing(headingTo(b, t) - b.heading)),
        distance: round1(d),
        x: round1(t.x),
        y: round1(t.y),
      }));
  }

  // ---- BehaviourWorld -----------------------------------------------------------------------

  lineOfSight(from: Vec2, to: Vec2): boolean {
    return this.segmentClear(from, to, this.arena.walls);
  }

  clearPath(from: Vec2, to: Vec2, radius: number, hover: boolean): boolean {
    const { walls, water, hazards } = this.arena;
    const blocking = hover ? walls : [...walls, ...water, ...hazards];
    return this.segmentClear(from, to, blocking.map((w) => inflate(w, radius - 1)));
  }

  private segmentClear(from: Vec2, to: Vec2, rects: Rect[]): boolean {
    const len = distance(from, to);
    if (len < 1e-6) return true;
    const dir = { x: (to.x - from.x) / len, y: (to.y - from.y) / len };
    return rects.every((r) => rayRect(from, dir, r) >= len);
  }

  explode(b: SimBot): void {
    if (!b.alive) return;
    this.destroy(b, 'damage');
    for (const o of this.bots) {
      if (!o.alive || o.team === b.team) continue;
      const d = distance(o, b) - o.radius;
      if (d > KAMIKAZE.radius) continue;
      this.damage(o, KAMIKAZE.damage * (1 - 0.5 * Math.max(0, d) / KAMIKAZE.radius), b);
    }
  }

  // ---- Simulation -------------------------------------------------------------------------

  private step(): void {
    this._tick++;
    for (const c of this.controllers) c.think(this);
    for (const b of this.bots) if (b.alive) this.updateEnergy(b);
    const before = this.bots.map((b) => ({ x: b.x, y: b.y }));
    for (const b of this.bots) {
      b.prevContact = b.contact;
      b.contact = new Set();
    }
    for (const b of this.bots) if (b.alive) this.updateDrive(b);
    this.collideBots();
    this.bots.forEach((b, i) => (b.lastMove = { x: b.x - before[i]!.x, y: b.y - before[i]!.y }));
    for (const b of this.bots) if (b.alive) this.updateProgress(b);
    for (const b of this.bots) if (b.alive) this.updateTerrain(b);
    this.updateProjectiles();
    for (const b of this.bots) {
      if (b.cooldown > 0) b.cooldown--;
      if (b.ramCooldown > 0) b.ramCooldown--;
    }
    if (this.player.alive) {
      this.events.push(
        ...this.objectives.update({ tick: this._tick, player: this.player, destroyed: this.destroyed }),
      );
    }
    if (!this.player.alive) this.endReason = 'bot_destroyed';
    else if (this.objectives.allDone) this.endReason = 'objectives_complete';
    else if (this._tick >= this.limitTicks) this.endReason = 'time_up';
    this.pushFrame();
  }

  private updateEnergy(b: SimBot): void {
    const cap = b.stats.energyCapacity;
    b.energy = Math.min(cap, b.energy + b.stats.recharge * DT);
    if (b.shield) {
      const cost = PARTS.shield.shield!.energyPerSecond * DT;
      if (b.energy >= cost) b.energy -= cost;
      else this.setShield(b, false);
    }
    if (!b.lowEnergy && b.energy < cap * LOW_ENERGY) {
      b.lowEnergy = true;
      this.events.push({ type: 'low_energy', botId: b.id });
    } else if (b.lowEnergy && b.energy > cap * LOW_ENERGY_RESET) b.lowEnergy = false;
  }

  private updateDrive(b: SimBot): void {
    const drive = b.driveStats;
    const cmd = b.command;
    if (!drive) return;

    // Moving costs energy; with too little the drive limps along at 25%.
    let power = 1;
    if (cmd) {
      const cost = drive.energyPerSecond * DT;
      if (b.energy >= cost) b.energy -= cost;
      else power = 0.25;
    }
    const terrain = this.arena.tileAt(b.x, b.y);
    const factor = (terrain === 'wall' ? 1 : drive.terrain[terrain].speedFactor) * power;
    const top = b.topSpeed * factor;
    const maxTurn = drive.turnRate * DT * power;

    let want = 0; // forward speed wanted along `dir`
    let dir: Vec2 = headingVector(b.heading);
    let remaining = Infinity;
    if (cmd?.kind === 'turn') {
      const rot = Math.sign(cmd.remaining) * Math.min(maxTurn, Math.abs(cmd.remaining));
      b.heading = normaliseHeading(b.heading + rot);
      cmd.remaining -= rot;
      if (Math.abs(cmd.remaining) < 1e-6) b.command = null;
    } else if (cmd?.kind === 'move') {
      dir = cmd.along;
      remaining = cmd.distance - cmd.moved;
      want = top;
    } else if (cmd?.kind === 'goto') {
      const bearing = normaliseBearing(headingTo(b, cmd.target) - b.heading);
      b.heading = normaliseHeading(b.heading + Math.sign(bearing) * Math.min(maxTurn, Math.abs(bearing)));
      remaining = distance(b, cmd.target) - cmd.stopWithin;
      if (remaining <= 0.5) b.command = null;
      else if (Math.abs(bearing) < 30) want = top;
      dir = headingVector(b.heading);
    }

    let dx: number;
    let dy: number;
    if (b.hover) {
      // Momentum: accelerate toward the wanted velocity, brake in time to arrive, drift when idle.
      if (b.command && want > 0) {
        const speed = Math.min(want, Math.sqrt(2 * drive.accel * Math.max(0, remaining)));
        const ax = dir.x * speed - b.vx;
        const ay = dir.y * speed - b.vy;
        const a = Math.hypot(ax, ay);
        const k = a > drive.accel * DT ? (drive.accel * DT) / a : 1;
        b.vx += ax * k;
        b.vy += ay * k;
      } else {
        b.vx *= drive.drift;
        b.vy *= drive.drift;
        if (Math.hypot(b.vx, b.vy) < 0.5) b.vx = b.vy = 0;
      }
      dx = b.vx * DT;
      dy = b.vy * DT;
    } else {
      b.speed = want > 0 ? Math.min(want, b.speed + drive.accel * DT) : 0;
      const len = Math.min(b.speed * DT, Math.max(0, remaining));
      dx = dir.x * len;
      dy = dir.y * len;
    }
    b.impactSpeed = b.currentSpeed;
    if (dx !== 0 || dy !== 0) this.moveBot(b, dx, dy);
  }

  /** Move with sub-steps, sliding along walls (and water for ground drives). */
  private moveBot(b: SimBot, dx: number, dy: number): void {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (b.radius * 0.5)));
    for (let i = 0; i < steps; i++) {
      b.x += dx / steps;
      b.y += dy / steps;
      this.resolveWalls(b);
    }
  }

  private resolveWalls(b: SimBot): void {
    const solids = b.hover ? this.arena.solids : this.arena.groundSolids;
    for (const r of solids) {
      const push = circleRectPush(b, b.radius, r);
      if (!push) continue;
      b.x += push.x;
      b.y += push.y;
      this.touched(b, push);
    }
  }

  /**
   * Contact on the side facing away from `push`: latch a bump if that side was not already
   * touching last tick (pressing on into a wall is not a new bump), kill velocity into it.
   */
  private touched(b: SimBot, push: Vec2): void {
    const side = sideFor(b.heading, headingTo({ x: 0, y: 0 }, { x: -push.x, y: -push.y }));
    if (!b.contact.has(side)) {
      b.contact.add(side);
      if (!b.prevContact.has(side)) {
        b.bumped[side] = true;
        if (b.partIn(side) === 'bump') this.events.push({ type: 'bump', botId: b.id, side });
      }
    }
    if (b.hover) {
      const len = Math.hypot(push.x, push.y) || 1;
      const nx = push.x / len;
      const ny = push.y / len;
      const into = b.vx * nx + b.vy * ny;
      if (into < 0) {
        b.vx -= into * nx;
        b.vy -= into * ny;
      }
    }
  }

  /**
   * Circle-circle separation. Turrets never move; tracks shove anything else; otherwise a
   * moving bot can't shove an idle one (it is held back), and two moving bots share the push.
   * Rams bite here.
   */
  private collideBots(): void {
    const alive = this.bots.filter((b) => b.alive);
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i]!;
        const c = alive[j]!;
        let dx = c.x - a.x;
        let dy = c.y - a.y;
        let d = Math.hypot(dx, dy);
        const overlap = a.radius + c.radius - d;
        if (overlap <= 0) continue;
        if (d < 1e-6) {
          dx = 1;
          dy = 0;
          d = 1;
        }
        const nx = dx / d;
        const ny = dy / d;
        let shareA = 0.5;
        if (a.immovable && c.immovable) shareA = 0;
        else if (a.immovable) shareA = 0;
        else if (c.immovable) shareA = 1;
        else if (a.driveStats?.pushes && !c.driveStats?.pushes) shareA = 0;
        else if (c.driveStats?.pushes && !a.driveStats?.pushes) shareA = 1;
        else if (a.moving !== c.moving) shareA = a.moving ? 1 : 0;
        const shareC = a.immovable && c.immovable ? 0 : 1 - shareA;
        a.x -= nx * overlap * shareA;
        a.y -= ny * overlap * shareA;
        c.x += nx * overlap * shareC;
        c.y += ny * overlap * shareC;
        this.touched(a, { x: -nx, y: -ny });
        this.touched(c, { x: nx, y: ny });
        if (shareA > 0) this.resolveWalls(a);
        if (shareC > 0) this.resolveWalls(c);
        this.ram(a, c);
        this.ram(c, a);
      }
    }
  }

  private ram(attacker: SimBot, target: SimBot): void {
    if (attacker.ramCooldown > 0 || !attacker.alive || !target.alive) return;
    const side = sideFor(attacker.heading, headingTo(attacker, target));
    if (attacker.partIn(side) !== 'ram') return;
    const frac = attacker.topSpeed > 0 ? Math.min(1, attacker.impactSpeed / attacker.topSpeed) : 0;
    if (frac < RAM_MIN_SPEED) return;
    attacker.ramCooldown = RAM_COOLDOWN;
    this.damage(target, PARTS.ram.ram!.damage * frac, attacker);
  }

  /** Move-command progress and blocked detection (no progress for STALL_TICKS ends the move). */
  private updateProgress(b: SimBot): void {
    const cmd = b.command;
    if (cmd?.kind === 'move') {
      const progress = b.lastMove.x * cmd.along.x + b.lastMove.y * cmd.along.y;
      cmd.moved = Math.min(cmd.distance, cmd.moved + Math.max(0, progress));
      cmd.stalled = progress < MIN_PROGRESS ? cmd.stalled + 1 : 0;
      if (cmd.distance - cmd.moved < (b.hover ? 0.5 : 0.01) || cmd.stalled >= STALL_TICKS) b.command = null;
      if (b.command === null && !b.hover) b.speed = 0;
    } else if (cmd?.kind === 'goto') {
      const wanted = b.speed > 0 || Math.hypot(b.vx, b.vy) > 0;
      cmd.stalled = wanted && Math.hypot(b.lastMove.x, b.lastMove.y) < MIN_PROGRESS ? cmd.stalled + 1 : 0;
    }
    // A ground bot pressed against something loses its speed (so rams need a run-up).
    if (!b.hover) b.speed = Math.min(b.speed, Math.hypot(b.lastMove.x, b.lastMove.y) / DT);
  }

  private updateTerrain(b: SimBot): void {
    const terrain = this.arena.tileAt(b.x, b.y);
    if (terrain !== b.lastTerrain && terrain !== 'floor' && terrain !== 'wall') {
      this.events.push({ type: 'hazard', botId: b.id, terrain, at: { x: round1(b.x), y: round1(b.y) } });
    }
    b.lastTerrain = terrain;
    if (!b.driveStats || terrain === 'wall' || terrain === 'floor') return;
    const eff = b.driveStats.terrain[terrain];
    if (eff.fatal) {
      this.destroy(b, 'pit');
      return;
    }
    if (eff.damagePerSecond > 0) {
      const dmg = eff.damagePerSecond * DT;
      b.hp -= dmg;
      b.damageTaken += dmg;
      if (b.hp <= 0) this.destroy(b, 'lava');
    }
  }

  private updateProjectiles(): void {
    const live: Projectile[] = [];
    for (const p of this.projectiles) {
      const dir = headingVector(p.heading);
      const step = Math.min(p.speed * DT, p.range - p.travelled);
      let t = step;
      let hitBot: SimBot | null = null;
      let hitWall = false;
      for (const r of this.arena.solids) {
        const tr = rayRect(p, dir, r);
        if (tr <= t) {
          t = tr;
          hitWall = true;
        }
      }
      for (const b of this.bots) {
        if (!b.alive || b === p.owner || b.team === p.owner.team) continue;
        const tb = rayCircle(p, dir, b, b.radius);
        if (tb <= t) {
          t = tb;
          hitBot = b;
        }
      }
      p.x += dir.x * t;
      p.y += dir.y * t;
      p.travelled += t;
      if (hitBot) {
        this.damage(hitBot, p.damage, { x: p.x - dir.x * 10, y: p.y - dir.y * 10 }, { x: p.x, y: p.y });
      } else if (hitWall) {
        this.events.push({ type: 'hit', targetId: 'wall', x: round1(p.x), y: round1(p.y), damage: 0 });
      } else if (p.travelled < p.range - 1e-6) {
        live.push(p);
      }
    }
    this.projectiles = live;
  }

  /** Apply damage arriving from `from`: armour on that side, then the shield, reduce it. */
  private damage(target: SimBot, amount: number, from: Vec2, at: Vec2 = target): void {
    const side = sideFor(target.heading, headingTo(target, from));
    const armour = target.partIn(side) === 'armour' ? PARTS.armour.armour!.reduction : 0;
    let dmg = amount * (1 - armour);
    if (target.shield) dmg *= 1 - PARTS.shield.shield!.reduction;
    target.hp -= dmg;
    target.damageTaken += dmg;
    this.events.push({
      type: 'hit',
      targetId: target.id,
      x: round1(at.x),
      y: round1(at.y),
      damage: round1(dmg),
      side,
      shielded: target.shield,
    });
    if (target.hp <= 0) this.destroy(target, 'damage');
  }

  private destroy(b: SimBot, cause: 'damage' | 'pit' | 'lava'): void {
    if (!b.alive) return;
    b.alive = false;
    b.hp = 0;
    b.command = null;
    b.speed = b.vx = b.vy = 0;
    if (b.shield) this.setShield(b, false);
    if (b.team === 'enemy') this.destroyed.add(b.id);
    this.events.push({ type: 'destroyed', botId: b.id, x: round1(b.x), y: round1(b.y), cause });
    if (cause !== 'pit') this.events.push({ type: 'explosion', x: round1(b.x), y: round1(b.y), size: 'large' });
  }

  private pushFrame(): void {
    const bots: BotFrame[] = this.bots.map((b) => ({
      id: b.id,
      x: round2(b.x),
      y: round2(b.y),
      heading: round2(b.heading) % 360,
      hp: round1(Math.max(0, b.hp)),
      energy: round1(b.energy),
      shield: b.shield,
      alive: b.alive,
      moving: b.alive && b.moving,
    }));
    const projectiles: ProjectileFrame[] = this.projectiles.map((p) => ({
      id: p.id,
      x: round2(p.x),
      y: round2(p.y),
      heading: p.heading,
      owner: p.owner.id,
    }));
    this.frames.push({ tick: this._tick, bots, projectiles, events: this.events });
    this.events = [];
    this.printsThisTick = 0;
  }
}

/** A finite number from a Python argument (NaN and non-numbers become 0). */
function num(v: PyValue | undefined): number {
  const n = typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : NaN;
  return Number.isNaN(n) ? 0 : n;
}

function xy(args: PyValue[]): Vec2 {
  return { x: num(args[0]), y: num(args[1]) };
}
