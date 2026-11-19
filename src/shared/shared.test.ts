import { describe, expect, it } from 'vitest';
import { countScriptLines, formatTicks, headingTo, normaliseBearing } from './index';

describe('shared helpers', () => {
  it('uses heading 0 = up, clockwise', () => {
    expect(headingTo({ x: 0, y: 0 }, { x: 0, y: -10 })).toBe(0);
    expect(headingTo({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(90);
    expect(headingTo({ x: 0, y: 0 }, { x: -10, y: 0 })).toBe(270);
    expect(normaliseBearing(270)).toBe(-90);
  });

  it('counts script lines and formats time', () => {
    expect(countScriptLines('# hi\n\nbot.drive.forward(10)\n  # x\nprint(1)\n')).toBe(2);
    expect(formatTicks(117)).toBe('00:03.9');
  });
});
