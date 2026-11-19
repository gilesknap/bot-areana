/**
 * World units and conventions shared by every module.
 *
 * - Distances are centimetres ("cm"). One floor tile is TILE_SIZE cm. The renderer draws
 *   1 cm = 1 px at scale 1 and scales the whole arena to fit.
 * - Origin is the top-left corner of the arena; x grows right, y grows DOWN (screen style).
 * - Heading: degrees, 0 = up ("north"), clockwise positive, normalised to [0, 360).
 * - Bearing: an angle relative to a bot's facing, (-180, 180], positive = to the right.
 *   So `bot.drive.turn(target.bearing)` always faces the target.
 * - Time: the sim runs at TICK_RATE fixed ticks per simulated second.
 */

export const TICK_RATE = 30;
export const TICK_SECONDS = 1 / TICK_RATE;
export const TILE_SIZE = 40;

export interface Vec2 {
  x: number;
  y: number;
}

/** Axis-aligned rectangle, top-left corner plus size, in cm. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A position plus a heading (degrees, see above). */
export interface Pose extends Vec2 {
  heading: number;
}

export function normaliseHeading(deg: number): number {
  const h = deg % 360;
  return h < 0 ? h + 360 : h;
}

/** Wrap an angle into (-180, 180]. */
export function normaliseBearing(deg: number): number {
  const b = normaliseHeading(deg);
  return b > 180 ? b - 360 : b;
}

/** Heading (0 = up, clockwise) of the vector from `from` to `to`. */
export function headingTo(from: Vec2, to: Vec2): number {
  return normaliseHeading((Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI);
}

/** Unit vector for a heading. */
export function headingVector(heading: number): Vec2 {
  const r = (heading * Math.PI) / 180;
  return { x: Math.sin(r), y: -Math.cos(r) };
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
