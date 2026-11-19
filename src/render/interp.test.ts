import { describe, expect, it } from 'vitest';
import type { BotFrame, Frame } from '../shared/frames';
import { lerpBot, lerpHeading, stateAt } from './interp';

const bot = (o: Partial<BotFrame>): BotFrame => ({
  id: 'player', x: 0, y: 0, heading: 0, hp: 100, energy: 50, shield: false, alive: true, moving: false, ...o,
});

describe('lerpHeading', () => {
  it('takes the short way round', () => {
    expect(lerpHeading(350, 10, 0.5)).toBeCloseTo(0);
    expect(lerpHeading(10, 350, 0.25)).toBeCloseTo(5);
    expect(lerpHeading(90, 180, 0.5)).toBeCloseTo(135);
  });
});

describe('lerpBot', () => {
  it('blends position and keeps discrete state from the earlier tick', () => {
    const b = lerpBot(bot({ x: 0, y: 0, shield: true }), bot({ x: 10, y: -20, shield: false }), 0.5);
    expect(b.x).toBe(5);
    expect(b.y).toBe(-10);
    expect(b.shield).toBe(true);
  });
});

describe('stateAt', () => {
  const frames: Frame[] = [
    { tick: 0, bots: [bot({ x: 0 })], projectiles: [{ id: 1, x: 0, y: 0, heading: 90, owner: 'player' }], events: [] },
    { tick: 1, bots: [bot({ x: 30 })], projectiles: [{ id: 1, x: 10, y: 0, heading: 90, owner: 'player' }, { id: 2, x: 0, y: 0, heading: 0, owner: 'player' }], events: [] },
  ];

  it('interpolates bots and projectiles between ticks', () => {
    const s = stateAt(frames, 0.5)!;
    expect(s.tick).toBe(0);
    expect(s.bots[0]!.x).toBe(15);
    expect(s.projectiles).toHaveLength(1);
    expect(s.projectiles[0]!.x).toBe(5);
  });

  it('clamps to the available frames', () => {
    expect(stateAt(frames, 7)!.bots[0]!.x).toBe(30);
    expect(stateAt(frames, -1)!.bots[0]!.x).toBe(0);
    expect(stateAt([], 0)).toBeNull();
  });
});
