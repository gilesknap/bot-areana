import { describe, expect, it } from 'vitest';
import type { BotDesign, UnlockId } from '../shared/parts';
import { canFit, designIssues, fitPart, issueText, meters, removePart, setChassis } from './workshopRules';

const ALL: ReadonlySet<UnlockId> = new Set<UnlockId>([
  'chassis_s', 'chassis_m', 'chassis_l', 'wheels', 'tracks', 'hover', 'rangefinder', 'radar', 'gps', 'bump',
  'blaster', 'ram', 'armour', 'shield', 'battery', 'battery_plus',
]);

describe('slot rules', () => {
  it('respects part slot types and chassis slots', () => {
    expect(canFit('chassis_m', 'blaster', 'front')).toBe(true);
    expect(canFit('chassis_m', 'blaster', 'left')).toBe(false);
    expect(canFit('chassis_s', 'rangefinder', 'left')).toBe(false); // S has no side slots
    expect(canFit('chassis_m', 'battery', 'centre')).toBe(true);
    expect(canFit('chassis_m', 'wheels', 'drive')).toBe(true);
    expect(canFit('chassis_m', 'wheels', 'front')).toBe(false);
    expect(canFit('chassis_m', 'pivot', 'drive')).toBe(false); // enemy only
    expect(canFit('chassis_m', 'mine_dropper', 'rear')).toBe(false); // coming soon
  });

  it('moves unique parts, allows several rangefinders', () => {
    let d: BotDesign = { chassis: 'chassis_m', drive: 'wheels', slots: {} };
    d = fitPart(d, 'blaster', 'front');
    d = fitPart(d, 'blaster', 'rear');
    expect(d.slots).toEqual({ rear: 'blaster' });
    d = fitPart(d, 'rangefinder', 'left');
    d = fitPart(d, 'rangefinder', 'right');
    expect(d.slots).toEqual({ rear: 'blaster', left: 'rangefinder', right: 'rangefinder' });
    expect(fitPart(d, 'shield', 'front')).toBe(d); // invalid fit is a no-op
    expect(removePart(d, 'left').slots.left).toBeUndefined();
    expect(removePart(d, 'drive').drive).toBeNull();
  });

  it('shrinking the chassis drops parts that no longer fit', () => {
    const d: BotDesign = { chassis: 'chassis_m', drive: 'wheels', slots: { front: 'blaster', left: 'rangefinder' } };
    expect(setChassis(d, 'chassis_s').slots).toEqual({ front: 'blaster' });
  });
});

describe('budget validation', () => {
  const budget = { weight: 40, power: 8 };

  it('a light bot within budget has no issues', () => {
    const d: BotDesign = { chassis: 'chassis_m', drive: 'wheels', slots: { front: 'blaster', centre: 'battery' } };
    expect(designIssues(d, budget, ALL)).toEqual([]);
  });

  it('flags overweight against the level budget, not just the chassis', () => {
    const d: BotDesign = {
      chassis: 'chassis_m',
      drive: 'tracks',
      slots: { front: 'armour', rear: 'armour', centre: 'battery' },
    };
    const issues = designIssues(d, budget, ALL);
    expect(issues).toContainEqual({ kind: 'overweight', weight: 45, limit: 40 });
    expect(issueText(issues[0]!)).toMatch(/Too heavy: 45 kg, the limit is 40 kg/);
  });

  it('flags power over budget', () => {
    const d: BotDesign = { chassis: 'chassis_m', drive: 'wheels', slots: { front: 'blaster', left: 'shield', right: 'radar' } };
    expect(designIssues(d, budget, ALL)).toContainEqual({ kind: 'over_power', power: 9, limit: 8 });
  });

  it('free play has no budget, only the chassis limit', () => {
    const d: BotDesign = { chassis: 'chassis_m', drive: 'wheels', slots: { front: 'blaster', left: 'shield', right: 'radar' } };
    expect(designIssues(d, undefined, ALL)).toEqual([]);
  });

  it('flags locked parts and a missing drive', () => {
    const d: BotDesign = { chassis: 'chassis_s', drive: null, slots: { front: 'blaster' } };
    const issues = designIssues(d, budget, new Set<UnlockId>(['chassis_s', 'wheels']));
    expect(issues).toContainEqual({ kind: 'no_drive' });
    expect(issues).toContainEqual({ kind: 'locked', part: 'blaster' });
  });

  it('meters show limits and over-budget state', () => {
    const d: BotDesign = { chassis: 'chassis_m', drive: 'wheels', slots: { front: 'blaster', left: 'rangefinder', centre: 'battery' } };
    const [weight, power, speed, hull] = meters(d, budget);
    expect(weight).toMatchObject({ value: '31 / 40 kg', over: false });
    expect(power).toMatchObject({ value: '5 / 8 W', over: false });
    expect(speed!.value).toBe('169 cm/s'); // 175 cm/s, slowed by 31 kg over the 30 kg wheels rating
    expect(hull!.value).toBe('100 HP');
  });
});
