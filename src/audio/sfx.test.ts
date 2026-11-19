import { describe, expect, it } from 'vitest';
import { isMuted, RECIPES, setMuted, sfx, sfxForEvent } from './index';

describe('sfxForEvent', () => {
  it('maps sim events to sounds', () => {
    expect(sfxForEvent({ type: 'muzzle_flash', botId: 'player', slot: 'front', x: 0, y: 0, heading: 0 })).toBe('blaster');
    expect(sfxForEvent({ type: 'muzzle_flash', botId: 'turret1', slot: 'front', x: 0, y: 0, heading: 0 })).toBe('enemy_blaster');
    expect(sfxForEvent({ type: 'hit', targetId: 'turret1', x: 0, y: 0, damage: 10 })).toBe('hit');
    expect(sfxForEvent({ type: 'hit', targetId: 'wall', x: 0, y: 0, damage: 0 })).toBeNull();
    expect(sfxForEvent({ type: 'explosion', x: 0, y: 0, size: 'large' })).toBe('big_explosion');
    expect(sfxForEvent({ type: 'marker', markerId: 'core1', state: 'collected' })).toBe('pickup');
    expect(sfxForEvent({ type: 'print', text: 'hi', stream: 'stdout' })).toBeNull();
  });
});

describe('recipes', () => {
  it('every sound has audible, finite voices', () => {
    for (const [name, voices] of Object.entries(RECIPES)) {
      expect(voices.length, name).toBeGreaterThan(0);
      for (const v of voices) {
        expect(v.volume).toBeGreaterThan(0);
        expect(v.volume).toBeLessThanOrEqual(1);
        expect(v.attack + v.sustain + v.decay).toBeGreaterThan(0);
        expect(Number.isFinite(v.freq[0]) && Number.isFinite(v.freq[1])).toBe(true);
      }
    }
  });
});

describe('mute', () => {
  it('toggles and sfx is a safe no-op without WebAudio', () => {
    setMuted(true);
    expect(isMuted()).toBe(true);
    setMuted(false);
    expect(isMuted()).toBe(false);
    expect(() => sfx('click')).not.toThrow();
  });
});
