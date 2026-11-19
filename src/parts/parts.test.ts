import { describe, expect, it } from 'vitest';
import type { BotDesign } from '../shared/parts';
import { botApi, computeStats, fittedApi, PARTS, signature, validateDesign } from './index';

const scout: BotDesign = {
  chassis: 'chassis_m',
  drive: 'wheels',
  slots: { front: 'blaster', left: 'rangefinder', centre: 'battery' },
};

describe('parts catalogue', () => {
  it('names fitted parts on the bot object', () => {
    expect(fittedApi(scout).map((f) => f.attr)).toEqual(['drive', 'blaster', 'left_sensor', 'battery']);
  });

  it('builds the API list with core methods first', () => {
    const api = botApi(scout);
    expect(api[0]!.attr).toBe('');
    expect(api.find((a) => a.attr === 'blaster')!.api.methods.map(signature)).toEqual(['fire()', 'ready()']);
    expect(signature(api.find((a) => a.attr === 'drive')!.api.methods[0]!)).toBe('forward(distance, wait=True)');
  });

  it('computes weight, power and speed', () => {
    const s = computeStats(scout);
    expect(s.weight).toBe(10 + 8 + 6 + 2 + 5);
    expect(s.power).toBe(5);
    expect(s.topSpeed).toBeCloseTo(140 * (30 / 31));
    expect(s.energyCapacity).toBe(100);
  });

  it('validates budget and slots', () => {
    expect(validateDesign(scout, { budget: { weight: 40, power: 8 } })).toEqual([]);
    const bad: BotDesign = { chassis: 'chassis_s', drive: null, slots: { left: 'rangefinder', front: 'battery' } };
    const kinds = validateDesign(bad, { budget: { weight: 40, power: 8 } }).map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(['no_drive', 'slot_missing', 'wrong_slot']));
  });

  it('only locomotion parts have drive stats', () => {
    for (const p of Object.values(PARTS)) expect(!!p.drive).toBe(p.category === 'locomotion');
  });
});
