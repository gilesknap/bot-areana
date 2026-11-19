/**
 * Campaign checks: level data is well formed, every reference solution wins headless (real
 * Pyodide + sim) with at least one star, and no starter script wins on its own.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateDesign } from '../parts';
import { runMatchHeadless } from '../python/headless';
import { TILE_CHARS, type LevelDef } from '../shared/level';
import { distance, TILE_SIZE } from '../shared/geometry';
import type { UnlockId } from '../shared/parts';
import { getLevel, isPlayable, LEVELS, unlockedFor } from '.';

const solution = (level: LevelDef) => readFileSync(new URL(level.solution.script, import.meta.url), 'utf8');

/** Parts available when playing `level` in the campaign. */
function unlockedAt(level: LevelDef): Set<UnlockId> {
  return new Set(LEVELS.filter((l) => l.number <= level.number).flatMap((l) => l.unlocks));
}

function summary(r: Awaited<ReturnType<typeof runMatchHeadless>>): string {
  const { won, reason, stars, seconds, damageTaken, energyLeft } = r.result;
  return JSON.stringify({ won, reason, stars, seconds, damageTaken, energyLeft, error: r.error?.message });
}

describe('campaign data', () => {
  it('has levels l01..l10 in order', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(Array.from({ length: 10 }, (_, i) => `l${String(i + 1).padStart(2, '0')}`));
    LEVELS.forEach((l, i) => expect(l.number).toBe(i + 1));
    expect(getLevel('l05')?.title).toBe('Target Practice');
  });

  it('unlocks follow the campaign order', () => {
    const fresh = { levels: {} };
    expect(isPlayable(fresh, 'l01')).toBe(true);
    expect(isPlayable(fresh, 'l02')).toBe(false);
    expect([...unlockedFor(fresh)].sort()).toEqual(['chassis_s', 'wheels']);
    const cleared = { levels: { l01: { cleared: true, bestStars: 1 as const, attempts: 1 } } };
    expect(isPlayable(cleared, 'l02')).toBe(true);
    expect(unlockedFor(cleared).has('rangefinder')).toBe(false);
  });

  for (const level of LEVELS) {
    it(`${level.id} is well formed`, () => {
      const cols = level.map[0]!.length;
      for (const row of level.map) {
        expect(row.length).toBe(cols);
        for (const ch of row) expect(ch in TILE_CHARS).toBe(true);
      }
      const width = cols * TILE_SIZE;
      const height = level.map.length * TILE_SIZE;
      const inside = (p: { x: number; y: number }) => p.x > 0 && p.y > 0 && p.x < width && p.y < height;
      const onFloor = (p: { x: number; y: number }) =>
        level.map[Math.floor(p.y / TILE_SIZE)]![Math.floor(p.x / TILE_SIZE)] !== '#';
      expect(inside(level.spawn) && onFloor(level.spawn)).toBe(true);
      for (const e of level.enemies) expect(inside(e.spawn) && onFloor(e.spawn)).toBe(true);
      for (const o of level.objectives) {
        const points = o.type === 'reach' ? [o.target] : o.type === 'waypoints' ? o.points : o.type === 'collect' ? o.items : [];
        for (const p of points) {
          expect(inside(p) && onFloor(p)).toBe(true);
          expect(distance(p, level.spawn)).toBeGreaterThan(o.type === 'reach' || o.type === 'collect' ? o.radius : 0);
        }
      }
      expect(level.hints.length).toBeGreaterThan(0);
      expect(level.hints.length).toBeLessThanOrEqual(3);
      expect(level.solution.script).toBe(`solutions/${level.id}.py`);
    });
  }
});

describe('reference solutions (headless Pyodide)', () => {
  for (const level of LEVELS) {
    it(`${level.id} ${level.title}: solution design is legal and the solution wins`, async () => {
      const { design } = level.solution;
      expect(validateDesign(design, { budget: level.budget, unlocked: unlockedAt(level) })).toEqual([]);
      const run = await runMatchHeadless(level, design, solution(level));
      expect(run.error, summary(run)).toBeUndefined();
      expect(run.result.won, summary(run)).toBe(true);
      expect(run.result.stars, summary(run)).toBeGreaterThanOrEqual(1);
    });

    it(`${level.id} ${level.title}: the starter alone does not win`, async () => {
      const run = await runMatchHeadless(level, level.solution.design, level.starter);
      expect(run.result.won, summary(run)).toBe(false);
    });
  }

  it('l03 solution copes with either lane being blocked', async () => {
    const level = getLevel('l03')!;
    const blocked = new Set<number>();
    for (const seed of [1, 2, 7, 8, 12]) {
      const run = await runMatchHeadless(level, level.solution.design, solution(level), seed);
      expect(run.result.won, `seed ${seed}: ${summary(run)}`).toBe(true);
      for (const w of run.world.walls) if (w.y === 200) blocked.add(w.x);
    }
    expect([...blocked].sort((a, b) => a - b)).toEqual([0, 480]);
  });
});
