/**
 * Pure helpers for smooth playback between simulated ticks.
 */
import type { BotFrame, Frame, ProjectileFrame } from '../shared/frames';
import { normaliseBearing, normaliseHeading } from '../shared/geometry';

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolate headings (degrees) along the shortest arc; result in [0, 360). */
export function lerpHeading(a: number, b: number, t: number): number {
  return normaliseHeading(a + normaliseBearing(b - a) * t);
}

/** Bot state between two ticks. Discrete fields (alive, shield, moving) come from `a`. */
export function lerpBot(a: BotFrame, b: BotFrame | undefined, t: number): BotFrame {
  if (!b || t <= 0) return a;
  return {
    ...a,
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    heading: lerpHeading(a.heading, b.heading, t),
    hp: lerp(a.hp, b.hp, t),
    energy: lerp(a.energy, b.energy, t),
  };
}

/** Projectiles present in both frames move smoothly; ones that vanish stay put until the tick ends. */
export function lerpProjectiles(a: ProjectileFrame[], b: ProjectileFrame[] | undefined, t: number): ProjectileFrame[] {
  if (!b || t <= 0) return a;
  const next = new Map(b.map((p) => [p.id, p]));
  return a.map((p) => {
    const q = next.get(p.id);
    return q ? { ...p, x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t), heading: lerpHeading(p.heading, q.heading, t) } : p;
  });
}

export interface InterpolatedState {
  tick: number;
  bots: BotFrame[];
  projectiles: ProjectileFrame[];
}

/** World state at fractional time `t` (in ticks) from a contiguous frame list. */
export function stateAt(frames: readonly Frame[], t: number): InterpolatedState | null {
  if (frames.length === 0) return null;
  const clamped = Math.min(Math.max(t, 0), frames.length - 1);
  const i = Math.floor(clamped);
  const a = frames[i]!;
  const b = frames[i + 1];
  const frac = clamped - i;
  const nextBots = b ? new Map(b.bots.map((bot) => [bot.id, bot])) : undefined;
  return {
    tick: a.tick,
    bots: a.bots.map((bot) => lerpBot(bot, nextBots?.get(bot.id), frac)),
    projectiles: lerpProjectiles(a.projectiles, b?.projectiles, frac),
  };
}
