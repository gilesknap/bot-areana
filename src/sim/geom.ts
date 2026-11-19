/** Collision and ray-casting helpers. Pure functions on cm coordinates. */
import type { Rect, Vec2 } from '../shared/geometry';
import { normaliseBearing } from '../shared/geometry';
import type { DirectionalSlot } from '../shared/parts';

/** Push needed to move a circle out of a rect, or null if they don't overlap. */
export function circleRectPush(c: Vec2, r: number, rect: Rect): Vec2 | null {
  const nx = Math.max(rect.x, Math.min(c.x, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(c.y, rect.y + rect.h));
  const dx = c.x - nx;
  const dy = c.y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return { x: (dx / d) * (r - d), y: (dy / d) * (r - d) };
  }
  // Centre inside the rect: leave by the nearest edge.
  const left = c.x - rect.x + r;
  const right = rect.x + rect.w - c.x + r;
  const up = c.y - rect.y + r;
  const down = rect.y + rect.h - c.y + r;
  const m = Math.min(left, right, up, down);
  if (m === left) return { x: -left, y: 0 };
  if (m === right) return { x: right, y: 0 };
  if (m === up) return { x: 0, y: -up };
  return { x: 0, y: down };
}

/** Distance along a ray (unit dir) to a rect, or Infinity. Starting inside counts as 0. */
export function rayRect(o: Vec2, dir: Vec2, rect: Rect): number {
  let tmin = 0;
  let tmax = Infinity;
  for (const [p, d, lo, hi] of [
    [o.x, dir.x, rect.x, rect.x + rect.w],
    [o.y, dir.y, rect.y, rect.y + rect.h],
  ] as const) {
    if (Math.abs(d) < 1e-12) {
      if (p < lo || p > hi) return Infinity;
    } else {
      let t1 = (lo - p) / d;
      let t2 = (hi - p) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

/** Distance along a ray (unit dir) to a circle's edge, or Infinity. */
export function rayCircle(o: Vec2, dir: Vec2, c: Vec2, r: number): number {
  const fx = o.x - c.x;
  const fy = o.y - c.y;
  const b = fx * dir.x + fy * dir.y;
  const cc = fx * fx + fy * fy - r * r;
  if (cc <= 0) return 0;
  const disc = b * b - cc;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : Infinity;
}

export function inflate(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, w: rect.w + 2 * by, h: rect.h + 2 * by };
}

/** Which side of a bot (facing `heading`) a point at absolute heading `toward` is on. */
export function sideFor(heading: number, toward: number): DirectionalSlot {
  const b = normaliseBearing(toward - heading);
  if (b >= -45 && b <= 45) return 'front';
  if (b > 45 && b <= 135) return 'right';
  if (b < -45 && b >= -135) return 'left';
  return 'rear';
}

export const round1 = (n: number): number => Math.round(n * 10) / 10;
export const round2 = (n: number): number => Math.round(n * 100) / 100;
