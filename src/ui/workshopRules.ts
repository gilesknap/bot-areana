/**
 * Pure Workshop logic: what may go where, fitting/removing parts, meters and issue text.
 * Kept free of the DOM so it can be unit tested.
 */
import type { BotDesign, ChassisId, DesignIssue, PartId, SlotId, UnlockId } from '../shared/parts';
import { CHASSIS, PARTS } from '../parts/catalogue';
import { computeStats, validateDesign } from '../parts/stats';
import { toCm } from '../shared/geometry';

export type Mount = SlotId | 'drive';

export interface Budget {
  weight: number;
  power: number;
}

/** Can `part` go on `mount` of this chassis (ignoring budget)? */
export function canFit(chassis: ChassisId, part: PartId, mount: Mount): boolean {
  const def = PARTS[part];
  if (def.enemyOnly || def.comingSoon) return false;
  if (mount === 'drive') return !!def.drive;
  return !def.drive && CHASSIS[chassis].slots.includes(mount) && def.slots.includes(mount);
}

/** A new design with `part` on `mount`. Unique parts move rather than duplicate. */
export function fitPart(design: BotDesign, part: PartId, mount: Mount): BotDesign {
  if (!canFit(design.chassis, part, mount)) return design;
  if (mount === 'drive') return { ...design, drive: part as BotDesign['drive'] };
  const slots = { ...design.slots };
  if (PARTS[part].unique) {
    for (const s of Object.keys(slots) as SlotId[]) if (slots[s] === part) delete slots[s];
  }
  slots[mount] = part;
  return { ...design, slots };
}

export function removePart(design: BotDesign, mount: Mount): BotDesign {
  if (mount === 'drive') return { ...design, drive: null };
  const slots = { ...design.slots };
  delete slots[mount];
  return { ...design, slots };
}

/** Switch chassis, dropping parts from slots the new chassis lacks. */
export function setChassis(design: BotDesign, chassis: ChassisId): BotDesign {
  const slots: BotDesign['slots'] = {};
  for (const [slot, part] of Object.entries(design.slots) as Array<[SlotId, PartId]>) {
    if (CHASSIS[chassis].slots.includes(slot)) slots[slot] = part;
  }
  return { ...design, chassis, slots };
}

export interface Meter {
  label: string;
  value: string;
  /** 0..1 bar fill */
  fill: number;
  over: boolean;
}

/** The four Workshop meters. `budget` undefined = free play (only the chassis limit applies). */
export function meters(design: BotDesign, budget?: Budget): Meter[] {
  const s = computeStats(design);
  const weightLimit = Math.min(s.maxWeight, budget?.weight ?? Infinity);
  const powerLimit = budget?.power;
  const power: Meter = powerLimit
    ? { label: 'Power draw', value: `${s.power} / ${powerLimit} W`, fill: s.power / powerLimit, over: s.power > powerLimit }
    : { label: 'Power draw', value: `${s.power} W`, fill: Math.min(1, s.power / 20), over: false };
  return [
    {
      label: 'Weight',
      value: `${s.weight} / ${weightLimit} kg`,
      fill: s.weight / weightLimit,
      over: s.weight > weightLimit,
    },
    power,
    { label: 'Top speed', value: `${Math.round(toCm(s.topSpeed))} cm/s`, fill: s.topSpeed / 220, over: false },
    { label: 'Hull', value: `${s.hp} HP`, fill: s.hp / 160, over: false },
  ].map((m) => ({ ...m, fill: Math.max(0, Math.min(1, m.fill)) }));
}

function partName(id: UnlockId): string {
  return id in CHASSIS ? CHASSIS[id as ChassisId].name : PARTS[id as PartId].name;
}

/** Plain-English text for a design problem. */
export function issueText(issue: DesignIssue): string {
  switch (issue.kind) {
    case 'no_drive':
      return 'Fit a drive train (wheels) so your bot can move.';
    case 'overweight':
      return `Too heavy: ${issue.weight} kg, the limit is ${issue.limit} kg.`;
    case 'over_power':
      return `Too much power draw: ${issue.power} W, the budget is ${issue.limit} W.`;
    case 'slot_missing':
      return `This chassis has no ${issue.slot} slot for the ${partName(issue.part)}.`;
    case 'wrong_slot':
      return `The ${partName(issue.part)} can't go in the ${issue.slot} slot.`;
    case 'duplicate':
      return `Only one ${partName(issue.part)} per bot.`;
    case 'locked':
      return `The ${partName(issue.part)} isn't unlocked yet.`;
    case 'unavailable':
      return `The ${partName(issue.part)} isn't available.`;
  }
}

/** Issues for the Workshop / run check. Free play passes no budget. */
export function designIssues(design: BotDesign, budget: Budget | undefined, unlocked: ReadonlySet<UnlockId>): DesignIssue[] {
  return validateDesign(design, budget ? { budget, unlocked } : { unlocked });
}

/** A starting design: the cheapest unlocked chassis with wheels. */
export function defaultDesign(): BotDesign {
  return { chassis: 'chassis_s', drive: 'wheels', slots: {} };
}
