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
    c.play();
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
    c.play();
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
    c.play();
    const u = c.advance(5000);
    expect(u.ended).toBe(true);
    expect(c.playing).toBe(false);
    expect(c.advance(5000).ended).toBe(false);
  });

  it('step pauses and moves exactly one whole tick', () => {
    const c = new PlaybackClock();
    c.push(frames(10));
    c.play();
    c.advance(50); // 1.5 ticks
    const u = c.step();
    expect(c.playing).toBe(false);
    expect(c.time).toBe(2);
    expect(ticksOf(u.reached)).toEqual([2]);
  });

  it('rewind replays events from the start; clear drops frames', () => {
    const c = new PlaybackClock();
    c.push(frames(4));
    c.play();
    c.advance(1000);
    c.rewind();
    expect(c.time).toBe(0);
    expect(ticksOf(c.advance(0).reached)).toEqual([0]);
    c.clear();
    expect(c.frames).toHaveLength(0);
    expect(c.advance(1000).reached).toEqual([]);
  });

  describe('line cursor', () => {
    // x = 3 / bot.drive.forward(...) take tick 0; the next lines start once the move ends at tick 6.
    const lines = [
      { tick: 0, line: 1 },
      { tick: 0, line: 2 },
      { tick: 6, line: 3 },
      { tick: 6, line: 4 },
      { tick: 9, line: 5 },
    ];
    const loaded = () => {
      const c = new PlaybackClock();
      c.push(frames(12), lines);
      return c;
    };

    /** Step, then let playback run (one tick per update at 1x) until the step has arrived. */
    const stepFully = (c: PlaybackClock) => {
      const reached = [...c.step().reached];
      while (c.moving) reached.push(...c.advance(1000 / 30).reached);
      return reached;
    };

    it('step visits every line, playing only when the next line starts later', () => {
      const c = loaded();
      expect(c.line).toBeNull();
      const seen: Array<[number, number | null]> = [];
      for (let i = 0; i < 5; i++) {
        stepFully(c);
        seen.push([c.time, c.line]);
      }
      expect(seen).toEqual([[0, 1], [0, 2], [6, 3], [6, 4], [9, 5]]);
    });

    it('a step to a later line plays there at the current speed, emitting each frame once', () => {
      const c = loaded();
      expect(ticksOf(c.step().reached)).toEqual([0]);
      expect(c.step().reached).toEqual([]);
      expect(c.step().reached).toEqual([]); // starts playing towards line 3 at tick 6
      expect(c.moving).toBe(true);
      expect(c.playing).toBe(false);
      expect(c.line).toBe(2);
      c.speed = 2;
      expect(ticksOf(c.advance(50).reached)).toEqual([1, 2, 3]);
      expect(c.line).toBe(2);
      expect(ticksOf(c.advance(1000).reached)).toEqual([4, 5, 6]);
      expect([c.time, c.line, c.moving]).toEqual([6, 3, false]);
    });

    it('stepping again while a step plays finishes it at once', () => {
      const c = loaded();
      c.step();
      c.step();
      c.step();
      c.advance(50);
      expect(ticksOf(c.step().reached)).toEqual([2, 3, 4, 5, 6]);
      expect([c.time, c.line, c.moving]).toEqual([6, 3, false]);
    });

    it('pause or play during a step', () => {
      const c = loaded();
      c.step();
      c.step();
      c.step();
      c.advance(100);
      c.pause();
      c.advance(1000);
      expect([c.time, c.line]).toEqual([3, 2]);
      c.step();
      c.play();
      c.advance(100);
      expect([c.time, c.line]).toEqual([6, 4]);
    });

    it('after the last line, step falls back to one tick', () => {
      const c = loaded();
      for (let i = 0; i < 5; i++) stepFully(c);
      c.step();
      expect(c.time).toBe(10);
      expect(c.line).toBe(5);
    });

    it('after the last line of a finished run, step plays to the end', () => {
      const c = loaded();
      c.finish();
      for (let i = 0; i < 5; i++) stepFully(c);
      expect(c.step().reached).toEqual([]);
      expect(c.moving).toBe(true);
      let ended = false;
      while (c.moving) ended ||= c.advance(1000 / 30).ended;
      expect([c.time, c.line, ended]).toEqual([11, 5, true]);
    });

    it('playing keeps the cursor on the last line started by the shown tick', () => {
      const c = loaded();
      c.play();
      c.advance(100); // 3 ticks
      expect(c.line).toBe(2);
      c.advance(100);
      expect(c.line).toBe(4);
      c.pause();
      stepFully(c);
      expect([c.time, c.line]).toEqual([9, 5]);
    });

    it('pausing mid-move steps to the line after the move', () => {
      const c = loaded();
      c.play();
      c.advance(100);
      c.pause();
      stepFully(c);
      expect([c.time, c.line]).toEqual([6, 3]);
    });

    it('steps one tick while the next line starts after the newest frame', () => {
      const c = new PlaybackClock();
      c.push(frames(4), [{ tick: 0, line: 1 }, { tick: 8, line: 2 }]);
      c.step();
      c.step();
      expect([c.time, c.line]).toEqual([1, 1]);
    });

    it('a finished run ends only after the lines at its last tick are stepped', () => {
      const c = new PlaybackClock();
      c.push(frames(5), [{ tick: 0, line: 1 }, { tick: 4, line: 2 }, { tick: 4, line: 3 }]);
      c.finish();
      stepFully(c);
      expect(stepFully(c).length).toBeGreaterThan(0);
      expect([c.time, c.line, c.ended]).toEqual([4, 2, false]);
      expect(c.step().ended).toBe(true);
      expect(c.line).toBe(3);
    });

    it('lines for past ticks that arrive late are skipped, not stepped through', () => {
      const c = new PlaybackClock();
      c.push(frames(3));
      c.step();
      c.step(); // no lines yet: one tick
      c.push(frames(6).slice(3), [{ tick: 0, line: 1 }, { tick: 0, line: 2 }, { tick: 4, line: 3 }]);
      stepFully(c);
      expect([c.time, c.line]).toEqual([4, 3]);
    });

    it('rewind and clear reset the cursor', () => {
      const c = loaded();
      c.step();
      c.step();
      c.step();
      c.rewind();
      expect(c.moving).toBe(false);
      expect(c.line).toBeNull();
      c.step();
      expect([c.time, c.line]).toEqual([0, 1]);
      c.clear();
      expect(c.line).toBeNull();
      expect(c.lines).toHaveLength(0);
    });
  });
});
