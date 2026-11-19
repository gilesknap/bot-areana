import type { BotDesign, BotStats, DesignIssue, UnlockId, PartId } from '../shared/parts';
import { SLOT_IDS } from '../shared/parts';
import { CHASSIS, PARTS } from './catalogue';

/** Speed multiplier for a bot heavier than its drive's refMass (never below half speed). */
export function weightFactor(weight: number, refMass: number): number {
  return Math.min(1, Math.max(0.5, refMass / weight));
}

function fittedParts(design: BotDesign): PartId[] {
  const parts = SLOT_IDS.map((s) => design.slots[s]).filter((p): p is PartId => !!p);
  return design.drive ? [design.drive, ...parts] : parts;
}

/** Derived numbers used by the Workshop meters and the sim. Single source of truth. */
export function computeStats(design: BotDesign): BotStats {
  const chassis = CHASSIS[design.chassis];
  const parts = fittedParts(design).map((id) => PARTS[id]);
  const weight = chassis.weight + parts.reduce((sum, p) => sum + p.weight, 0);
  const power = parts.reduce((sum, p) => sum + p.power, 0);
  const drive = design.drive ? PARTS[design.drive].drive : undefined;
  const battery = parts.find((p) => p.battery)?.battery;
  return {
    weight,
    maxWeight: chassis.maxWeight,
    power,
    topSpeed: drive ? drive.topSpeed * weightFactor(weight, drive.refMass) : 0,
    turnRate: drive ? drive.turnRate : 0,
    hp: chassis.hp,
    energyCapacity: chassis.energy + (battery?.capacity ?? 0),
    recharge: chassis.recharge + (battery?.recharge ?? 0),
    radius: chassis.radius,
  };
}

export interface ValidateOptions {
  /** Level budget; omit for free-form checks. */
  budget?: { weight: number; power: number };
  /** Parts and chassis the player has unlocked; omit to skip the check. */
  unlocked?: ReadonlySet<UnlockId>;
}

/** Everything wrong with a design; an empty list means it may be sent into the arena. */
export function validateDesign(design: BotDesign, opts: ValidateOptions = {}): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const chassis = CHASSIS[design.chassis];
  const stats = computeStats(design);

  if (!design.drive) issues.push({ kind: 'no_drive' });
  const weightLimit = Math.min(chassis.maxWeight, opts.budget?.weight ?? Infinity);
  if (stats.weight > weightLimit) issues.push({ kind: 'overweight', weight: stats.weight, limit: weightLimit });
  if (opts.budget && stats.power > opts.budget.power) {
    issues.push({ kind: 'over_power', power: stats.power, limit: opts.budget.power });
  }

  const seen = new Set<PartId>();
  for (const slot of SLOT_IDS) {
    const part = design.slots[slot];
    if (!part) continue;
    const def = PARTS[part];
    if (!chassis.slots.includes(slot)) issues.push({ kind: 'slot_missing', slot, part });
    else if (!def.slots.includes(slot)) issues.push({ kind: 'wrong_slot', slot, part });
    if (def.unique && seen.has(part)) issues.push({ kind: 'duplicate', part });
    seen.add(part);
  }

  for (const id of [design.chassis, ...fittedParts(design)] as UnlockId[]) {
    const def = id in CHASSIS ? CHASSIS[id as keyof typeof CHASSIS] : PARTS[id as PartId];
    if (def.enemyOnly || ('comingSoon' in def && def.comingSoon)) issues.push({ kind: 'unavailable', part: id });
    else if (opts.unlocked && !opts.unlocked.has(id)) issues.push({ kind: 'locked', part: id });
  }
  return issues;
}
