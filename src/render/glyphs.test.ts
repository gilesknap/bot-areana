import { describe, expect, it } from 'vitest';
import { CHASSIS, PARTS } from '../parts/catalogue';
import type { ChassisId, PartId } from '../shared/parts';
import { botSvg, markerSvg, partGlyphSvg, tileSvg } from './glyphs';

describe('glyphs', () => {
  it('draws every part and chassis in its category colour', () => {
    for (const id of Object.keys(PARTS) as PartId[]) {
      const s = partGlyphSvg(id, 40);
      expect(s).toMatch(/^<svg [^>]*width="40"/);
      expect(s).not.toContain('"C"');
    }
    for (const id of Object.keys(CHASSIS) as ChassisId[]) expect(partGlyphSvg(id)).toContain('#3FD0E0');
    expect(partGlyphSvg('blaster')).toContain('#FF6B7A');
  });

  it('composes bots from fitted parts', () => {
    const s = botSvg({ chassis: 'chassis_m', drive: 'wheels', slots: { front: 'blaster', left: 'rangefinder', centre: 'battery' } }, { team: 'player' });
    expect(s).toContain('aria-label="Player bot"');
    expect(s).toContain('#FF6B7A'); // blaster
    expect(s).toContain('#5BE39A'); // rangefinder
    expect(s).toContain('#C792EA'); // battery
    const turret = botSvg({ chassis: 'turret_base', drive: 'pivot', slots: { front: 'blaster' } }, { team: 'enemy' });
    expect(turret).toContain('#FFB547');
  });

  it('gives each SVG unique gradient ids so several can share a page', () => {
    const d = { chassis: 'chassis_s', drive: 'wheels', slots: {} } as const;
    const ids = (s: string) => [...s.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    const a = ids(botSvg(d, { team: 'player' }));
    const b = ids(botSvg(d, { team: 'player' }));
    expect(a.some((id) => b.includes(id))).toBe(false);
  });

  it('draws markers and tiles', () => {
    expect(markerSvg('waypoint', 72, 3)).toContain('>3<');
    expect(markerSvg('core')).toContain('#C792EA');
    expect(tileSvg('lava')).toContain('radialGradient');
  });
});
