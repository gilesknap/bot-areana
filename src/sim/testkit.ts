/** Helpers for sim tests: tiny levels and a match that records its frames. */
import type { Frame } from '../shared/frames';
import type { EnemyDef, LevelDef } from '../shared/level';
import type { BotDesign } from '../shared/parts';
import type { PyValue } from '../shared/protocol';
import { MatchOver } from '../shared/errors';
import { Match } from './match';

export const WHEELS_S: BotDesign = { chassis: 'chassis_s', drive: 'wheels', slots: {} };

/** An empty `cols` x `rows` floor with the player at the centre facing up. */
export function makeLevel(over: Partial<LevelDef> = {}, cols = 30, rows = 30): LevelDef {
  return {
    id: 'test',
    number: 0,
    title: 'Test',
    concept: 'test',
    brief: '',
    lesson: { title: '', snippet: '', blurb: '' },
    map: Array.from({ length: rows }, () => '.'.repeat(cols)),
    spawn: { x: (cols * 40) / 2, y: (rows * 40) / 2, heading: 0 },
    objectives: [{ type: 'survive', id: 'o1', label: 'Survive', seconds: 170 }],
    enemies: [],
    budget: { weight: 100, power: 100 },
    unlocks: [],
    stars: [
      { type: 'time', seconds: 10, label: '' },
      { type: 'damage', max: 0, label: '' },
    ],
    seed: 1,
    starter: '',
    hints: [],
    solution: { design: WHEELS_S, script: '' },
    ...over,
  };
}

export function enemy(id: string, behaviour: EnemyDef['behaviour'], x: number, y: number, extra: Partial<EnemyDef> = {}): EnemyDef {
  const designs: Record<string, BotDesign> = {
    static: { chassis: 'chassis_s', drive: null, slots: {} },
    turret: { chassis: 'turret_base', drive: 'pivot', slots: { front: 'blaster' } },
  };
  return {
    id,
    behaviour,
    design: designs[behaviour] ?? { chassis: 'chassis_m', drive: 'wheels', slots: { front: 'blaster' } },
    spawn: { x, y, heading: 180 },
    ...extra,
  };
}

/** Wraps a Match: keeps every frame, and turns MatchOver into a returned marker. */
export class Harness {
  readonly m: Match;
  readonly frames: Frame[] = [];

  constructor(level: LevelDef, design: BotDesign = WHEELS_S, seed = level.seed, scriptLines = 5) {
    this.m = new Match({ level, design, seed, scriptLines });
    this.collect();
  }

  get p() {
    return this.m.player;
  }

  call(attr: string, method: string, ...args: PyValue[]): PyValue | 'MATCH_OVER' {
    try {
      return this.m.call(attr, method, args);
    } catch (e) {
      if (e instanceof MatchOver) return 'MATCH_OVER';
      throw e;
    } finally {
      this.collect();
    }
  }

  /** Ticks a call took. */
  cost(attr: string, method: string, ...args: PyValue[]): number {
    const t = this.m.tick;
    this.call(attr, method, ...args);
    return this.m.tick - t;
  }

  wait(seconds: number) {
    return this.call('', 'wait', seconds);
  }

  finish() {
    this.m.finish();
    this.collect();
  }

  events<T extends Frame['events'][number]['type']>(type: T) {
    return this.frames.flatMap((f) => f.events.filter((e) => e.type === type)) as Array<
      Extract<Frame['events'][number], { type: T }>
    >;
  }

  bot(id: string) {
    return this.m.bots.find((b) => b.id === id)!;
  }

  private collect() {
    this.frames.push(...this.m.takeFrames());
  }
}
