/**
 * World units and conventions shared by every module.
 *
 * - The sim works in world units: one floor tile is TILE_SIZE units, and the renderer draws
 *   1 unit = 1 px at scale 1, scaling the whole arena to fit.
 * - The player sees centimetres: every distance, position and speed crossing the Python API (and
 *   every part stat or level text shown to the player) is in cm, CM_PER_UNIT cm per world unit. A
 *   floor plate (2x2 tiles) is 100 cm, so a tile is 50 cm. Convert only at that boundary.
 * - Origin is the top-left corner of the arena; x grows right, y grows DOWN (screen style).
 * - Heading: degrees, 0 = up ("north"), clockwise positive, normalised to [0, 360).
 * - Bearing: an angle relative to a bot's facing, (-180, 180], positive = to the right.
 *   So `bot.drive.turn(target.bearing)` always faces the target.
 * - Time: the sim runs at TICK_RATE fixed ticks per simulated second.
 */

export const TICK_RATE = 30;
export const TICK_SECONDS = 1 / TICK_RATE;
export const TILE_SIZE = 40;
/** Centimetres the player sees per world unit (a floor plate of 2 tiles = 80 units = 100 cm). */
export const CM_PER_UNIT = 1.25;

/** World units to the cm the player sees. */
export function toCm(units: number): number {
  return units * CM_PER_UNIT;
}

/** cm from the player to world units. */
export function fromCm(cm: number): number {
  return cm / CM_PER_UNIT;
}

export interface Vec2 {
  x: number;
  y: number;
}

/** Axis-aligned rectangle, top-left corner plus size, in world units. */
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
