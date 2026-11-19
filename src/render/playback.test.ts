import { describe, expect, it } from 'vitest';
import type { Frame } from '../shared/frames';
import { PlaybackClock } from './playback';

const frame = (tick: number, events: Frame['events'] = []): Frame => ({ tick, bots: [], projectiles: [], events });
const frames = (n: number) => Array.from({ length: n }, (_, i) => frame(i, [{ type: 'print', text: `t${i}`, stream: 'stdout' }]));
const ticksOf = (fs: Frame[]) => fs.map((f) => f.tick);

describe('PlaybackClock', () => {
  it('emits frame 0 immediately and nothing while paused', () => {
    const c = new PlaybackClock();
    c.push(frames(10));
    expect(ticksOf(c.advance(1000).reached)).toEqual([0]);
    expect(c.time).toBe(0);
    expect(c.advance(1000).reached).toEqual([]);
  });

  it('advances 30 ticks per second scaled by speed, emitting each frame once', () => {
    const c = new PlaybackClock();
    c.push(frames(100));
    c.playing = true;
    expect(ticksOf(c.advance(100).reached)).toEqual([0, 1, 2, 3]);
    c.speed = 2;
    expect(ticksOf(c.advance(100).reached)).toEqual([4, 5, 6, 7, 8, 9]);
    c.speed = 0.5;
    c.advance(100);
    expect(c.time).toBeCloseTo(10.5);
  });

  it('waits at the newest frame while streaming, then resumes', () => {
    const c = new PlaybackClock();
    c.push(frames(5));
    c.playing = true;
    c.advance(1000);
    expect(c.time).toBe(4);
    expect(c.playing).toBe(true);
    c.push([frame(5), frame(6)]);
    expect(ticksOf(c.advance(1000).reached)).toEqual([5, 6]);
  });

  it('signals the end once for a finished run and pauses', () => {
    const c = new PlaybackClock();
    c.push(frames(3));
    c.finish();
    c.playing = true;
    const u = c.advance(5000);
    expect(u.ended).toBe(true);
    expect(c.playing).toBe(false);
    expect(c.advance(5000).ended).toBe(false);
  });

  it('step pauses and moves exactly one whole tick', () => {
    const c = new PlaybackClock();
    c.push(frames(10));
    c.playing = true;
    c.advance(50); // 1.5 ticks
    const u = c.step();
    expect(c.playing).toBe(false);
    expect(c.time).toBe(2);
    expect(ticksOf(u.reached)).toEqual([2]);
  });

  it('rewind replays events from the start; clear drops frames', () => {
    const c = new PlaybackClock();
    c.push(frames(4));
    c.playing = true;
    c.advance(1000);
    c.rewind();
    expect(c.time).toBe(0);
    expect(ticksOf(c.advance(0).reached)).toEqual([0]);
    c.clear();
    expect(c.frames).toHaveLength(0);
    expect(c.advance(1000).reached).toEqual([]);
  });
});
