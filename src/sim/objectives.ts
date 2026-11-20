/** Objective tracking and star evaluation. */
import type { Vec2 } from '../shared/geometry';
import { distance, TICK_RATE } from '../shared/geometry';
import type { SimEvent } from '../shared/frames';
import type { LevelDef, Objective, StarCriterion } from '../shared/level';
import type { ObjectiveProgress } from '../shared/result';

interface Tracked {
  def: Objective;
  progress: number;
  total: number;
  done: boolean;
  /** Per point/item: reached or collected. */
  hits: boolean[];
}

export interface ObjectiveWorld {
  tick: number;
  player: Vec2;
  /** Ids of destroyed enemies. */
  destroyed: ReadonlySet<string>;
}

export class Objectives {
  private readonly list: Tracked[];
  private readonly enemyIds: string[];

  constructor(level: LevelDef) {
    const enemyIds = level.enemies.map((e) => e.id);
    this.enemyIds = enemyIds;
    this.list = level.objectives.map((def) => {
      let total = 1;
      if (def.type === 'waypoints') total = def.points.length;
      if (def.type === 'collect') total = def.items.length;
      if (def.type === 'destroy') total = (def.enemies ?? enemyIds).length;
      if (def.type === 'survive') total = def.seconds;
      return { def, progress: 0, total, done: false, hits: Array<boolean>(total).fill(false) };
    });
  }

  /** The tick-0 events: one per objective. */
  initialEvents(): SimEvent[] {
    return this.list.map((o) => this.event(o));
  }

  get allDone(): boolean {
    return this.list.every((o) => o.done);
  }

  /** Still-unvisited waypoints/cores/flags, for radar. */
  pending(): Array<{ kind: 'flag' | 'waypoint' | 'core'; x: number; y: number }> {
    const out: Array<{ kind: 'flag' | 'waypoint' | 'core'; x: number; y: number }> = [];
    for (const o of this.list) {
      const d = o.def;
      if (d.type === 'reach' && !o.done) out.push({ kind: 'flag', ...d.target });
      if (d.type === 'waypoints') d.points.forEach((p, i) => !o.hits[i] && out.push({ kind: 'waypoint', ...p }));
      if (d.type === 'collect') d.items.forEach((p, i) => !o.hits[i] && out.push({ kind: 'core', ...p }));
    }
    return out;
  }

  /** Advance progress; returns the marker/objective events for this tick. */
  update(w: ObjectiveWorld): SimEvent[] {
    const events: SimEvent[] = [];
    for (const o of this.list) {
      if (o.done) continue;
      const before = o.progress;
      const d = o.def;
      switch (d.type) {
        case 'reach':
          if (distance(w.player, d.target) <= d.radius) {
            o.progress = 1;
            events.push({ type: 'marker', markerId: d.id, state: 'reached' });
          }
          break;
        case 'waypoints': {
          const next = d.points[o.progress];
          if (next && distance(w.player, next) <= d.radius) {
            o.hits[o.progress] = true;
            o.progress++;
            events.push({ type: 'marker', markerId: `${d.id}.${o.progress}`, state: 'reached' });
          }
          break;
        }
        case 'collect':
          d.items.forEach((p, i) => {
            if (!o.hits[i] && distance(w.player, p) <= d.radius) {
              o.hits[i] = true;
              o.progress++;
              events.push({ type: 'marker', markerId: `${d.id}.${i + 1}`, state: 'collected' });
            }
          });
          break;
        case 'destroy':
          o.progress = (d.enemies ?? this.enemyIds).filter((id) => w.destroyed.has(id)).length;
          break;
        case 'survive':
          // Nothing left to survive once every enemy is destroyed: done early.
          o.progress =
            this.enemyIds.length > 0 && this.enemyIds.every((id) => w.destroyed.has(id))
              ? d.seconds
              : Math.min(d.seconds, Math.floor(w.tick / TICK_RATE));
          break;
      }
      o.done = o.progress >= o.total;
      if (o.progress !== before || o.done) events.push(this.event(o));
    }
    return events;
  }

  progress(): ObjectiveProgress[] {
    return this.list.map((o) => ({
      id: o.def.id,
      label: o.def.label,
      progress: o.progress,
      total: o.total,
      done: o.done,
    }));
  }

  private event(o: Tracked): SimEvent {
    return { type: 'objective', objectiveId: o.def.id, progress: o.progress, total: o.total, done: o.done };
  }
}

export interface StarInputs {
  seconds: number;
  damageTaken: number;
  scriptLines: number;
  /** Percent of capacity left (0..100), the same scale as bot.battery.level(). */
  energyPercent: number;
}

export function starMet(c: StarCriterion, s: StarInputs): boolean {
  switch (c.type) {
    case 'time':
      return s.seconds <= c.seconds;
    case 'damage':
      return s.damageTaken <= c.max;
    case 'lines':
      return s.scriptLines <= c.max;
    case 'energy':
      return s.energyPercent >= c.min;
  }
}
