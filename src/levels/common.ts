/** Shared bits for level definitions: enemy hardware and small coordinate helpers. */
import type { Vec2 } from '../shared/geometry';
import { TILE_SIZE } from '../shared/geometry';
import type { BotDesign } from '../shared/parts';

/** Centre of map tile (col, row) in cm. */
export function tile(col: number, row: number): Vec2 {
  return { x: (col + 0.5) * TILE_SIZE, y: (row + 0.5) * TILE_SIZE };
}

/** Enemy hardware used across the campaign. */
export const ENEMY = {
  turret: { chassis: 'turret_base', drive: 'pivot', slots: { front: 'blaster' } },
  gunner: { chassis: 'chassis_m', drive: 'wheels', slots: { front: 'blaster', centre: 'battery' } },
  brute: { chassis: 'chassis_m', drive: 'tracks', slots: { front: 'blaster', left: 'armour', right: 'armour' } },
  kamikaze: { chassis: 'chassis_s', drive: 'wheels', slots: {} },
} satisfies Record<string, BotDesign>;
