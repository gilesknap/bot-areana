/**
 * How fitted parts are named on the Python `bot` object.
 *
 *   drive train              -> bot.drive
 *   unique parts             -> bot.<name>: bot.radar, bot.gps, bot.blaster, bot.shield,
 *                               bot.battery (Battery and Battery+ both), bot.mines
 *   rangefinder (per slot)   -> bot.front_sensor, bot.rear_sensor, bot.left_sensor, bot.right_sensor
 *   bump sensor (per slot)   -> bot.front_bumper, bot.rear_bumper, bot.left_bumper, bot.right_bumper
 *   armour, ram spike        -> passive, no attribute
 *
 * Core methods (log, wait, health, time) live directly on `bot` and are always present.
 */
import type { FittedApi } from '../shared/api';
import type { BotDesign, PartId, SlotId } from '../shared/parts';
import { SLOT_IDS } from '../shared/parts';

const UNIQUE_ATTR: Partial<Record<PartId, string>> = {
  radar: 'radar',
  gps: 'gps',
  blaster: 'blaster',
  shield: 'shield',
  battery: 'battery',
  battery_plus: 'battery',
  mine_dropper: 'mines',
};

/** Python attribute for a part in a slot, or null for passive parts. */
export function apiAttr(part: PartId, slot: SlotId | 'drive'): string | null {
  if (slot === 'drive') return 'drive';
  if (part === 'rangefinder') return `${slot}_sensor`;
  if (part === 'bump') return `${slot}_bumper`;
  return UNIQUE_ATTR[part] ?? null;
}

/** Every attribute the `bot` object will have for this design, drive first then slot order. */
export function fittedApi(design: BotDesign): FittedApi[] {
  const out: FittedApi[] = [];
  if (design.drive) out.push({ attr: 'drive', part: design.drive, slot: 'drive' });
  for (const slot of SLOT_IDS) {
    const part = design.slots[slot];
    if (!part) continue;
    const attr = apiAttr(part, slot);
    if (attr) out.push({ attr, part, slot });
  }
  return out;
}
