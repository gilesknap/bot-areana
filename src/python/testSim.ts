/**
 * A tiny stand-in SimMatch for the Python bridge tests, so they don't depend on the real sim's
 * physics. Follows the SimMatch contract: one frame per tick from tick 0, calls step the clock,
 * BotApiError for game errors, MatchOver once the match has ended.
 */
import { BotApiError, MatchOver } from '../shared/errors';
import type { Frame, SimEvent, WorldInit } from '../shared/frames';
import { headingVector } from '../shared/geometry';
import type { LevelDef } from '../shared/level';
import type { BotDesign } from '../shared/parts';
import type { CreateMatch, MatchOptions, PyValue, SimMatch } from '../shared/protocol';
import type { EndReason, MatchResult } from '../shared/result';

const SPEED = 10; // cm per tick

export const testLevel = (overrides: Partial<LevelDef> = {}): LevelDef => ({
  id: 'l99',
  number: 99,
  title: 'Test hall',
  concept: 'test',
  brief: '',
  lesson: { title: '', snippet: '', blurb: '' },
  map: ['..........', '..........'],
  spawn: { x: 100, y: 100, heading: 90 },
  objectives: [{ type: 'reach', id: 'goal', label: 'Reach the flag', target: { x: 300, y: 100 }, radius: 20 }],
  timeLimit: 10,
  enemies: [],
  budget: { weight: 100, power: 100 },
  unlocks: [],
  stars: [
    { type: 'time', seconds: 5, label: 'fast' },
    { type: 'lines', max: 5, label: 'short' },
  ],
  seed: 1,
  starter: '',
  hints: [],
  solution: { design: { chassis: 'chassis_s', drive: 'wheels', slots: {} }, script: '' },
  ...overrides,
});

export const testDesign: BotDesign = {
  chassis: 'chassis_m',
  drive: 'wheels',
  slots: { front: 'rangefinder', left: 'blaster', centre: 'battery' },
};

class TestMatch implements SimMatch {
  readonly world: WorldInit;
  tick = 0;
  finished = false;
  /** Every call the sim received, for assertions. */
  readonly calls: Array<[string, string, PyValue[]]> = [];
  private x: number;
  private y: number;
  private heading: number;
  private remaining = 0;
  private moved = 0;
  private cooldownUntil = 0;
  private reason: EndReason = 'time_up';
  private events: SimEvent[] = [];
  private frames: Frame[] = [];
  private readonly limit: number;

  constructor(private readonly opts: MatchOptions) {
    const { spawn } = opts.level;
    [this.x, this.y, this.heading] = [spawn.x, spawn.y, spawn.heading];
    this.limit = (opts.level.timeLimit ?? 180) * 30;
    this.world = {
      walls: [],
      width: 400,
      height: 200,
      bots: [{ id: 'player', team: 'player', design: opts.design, start: spawn, maxHp: 100, maxEnergy: 100 }],
      markers: [],
      seed: opts.seed,
    };
    this.events.push({ type: 'objective', objectiveId: 'goal', progress: 0, total: 1, done: false });
    this.emit();
  }

  private emit() {
    const bot = { id: 'player', x: this.x, y: this.y, heading: this.heading, hp: 100, energy: 100, shield: false, alive: true, moving: this.remaining > 0 };
    this.frames.push({ tick: this.tick, bots: [bot], projectiles: [], events: this.events });
    this.events = [];
  }

  private step(n = 1) {
    for (let i = 0; i < n; i++) {
      if (this.finished) throw new MatchOver();
      this.tick++;
      if (this.remaining > 0) {
        const d = Math.min(SPEED, this.remaining);
        const v = headingVector(this.heading);
        this.x += v.x * d;
        this.y += v.y * d;
        this.remaining -= d;
        this.moved += d;
      }
      const goal = this.opts.level.objectives[0];
      if (goal?.type === 'reach' && Math.hypot(this.x - goal.target.x, this.y - goal.target.y) <= goal.radius) {
        this.end('objectives_complete');
      } else if (this.tick >= this.limit) {
        this.end('time_up');
      }
      this.emit();
    }
  }

  private end(reason: EndReason) {
    this.finished = true;
    this.reason = reason;
  }

  call(attr: string, method: string, args: PyValue[]): PyValue {
    if (this.finished) throw new MatchOver();
    this.calls.push([attr, method, args]);
    const key = `${attr}.${method}`;
    switch (key) {
      case '.wait':
        this.step(Math.max(1, Math.round((args[0] as number) * 30)));
        return null;
      case '.time':
        this.step();
        return Math.round((this.tick / 30) * 10) / 10;
      case 'drive.forward': {
        this.remaining = args[0] as number;
        this.moved = 0;
        if (!args[1]) return this.step(), null;
        while (this.remaining > 0) this.step();
        return this.moved;
      }
      case 'drive.turn':
        this.heading = (((this.heading + (args[0] as number)) % 360) + 360) % 360;
        this.step();
        return null;
      case 'blaster.fire':
        if (this.tick < this.cooldownUntil) throw new BotApiError('BlasterNotReady');
        this.cooldownUntil = this.tick + 30;
        this.step();
        return null;
      case 'gps.position':
        this.step();
        return [this.x, this.y];
      case 'radar.scan':
        this.step();
        return [{ kind: 'turret', bearing: 45, distance: 200, x: 250, y: 50 }];
      case 'front_sensor.distance':
        this.step();
        return 600;
      default:
        this.step();
        return 0;
    }
  }

  print(text: string, stream: 'stdout' | 'stderr' | 'log') {
    this.events.push({ type: 'print', text, stream });
  }

  finish() {
    while (!this.finished) this.step();
  }

  abort(reason: 'script_error' | 'watchdog' | 'aborted') {
    if (!this.finished) this.end(reason);
    // Pending print events still need a frame to ride in.
    if (this.events.length) {
      this.tick++;
      this.emit();
    }
  }

  takeFrames(): Frame[] {
    const out = this.frames;
    this.frames = [];
    return out;
  }

  result(): MatchResult {
    const won = this.reason === 'objectives_complete';
    return {
      won,
      reason: this.reason,
      stars: won ? 1 : 0,
      starFlags: [won, false, false],
      ticks: this.tick,
      seconds: this.tick / 30,
      damageTaken: 0,
      energyLeft: 100,
      objectives: [{ id: 'goal', label: 'Reach the flag', progress: won ? 1 : 0, total: 1, done: won }],
    };
  }
}

/** createMatch for tests; `lastMatch` is the most recent match (to inspect `calls`). */
export const testSim: { lastMatch?: TestMatch; createMatch: CreateMatch } = {
  createMatch: (opts) => (testSim.lastMatch = new TestMatch(opts)),
};
