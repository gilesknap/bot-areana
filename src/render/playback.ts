/**
 * Playback clock over an append-only frame buffer. Pure (no Phaser), so it is unit-tested.
 *
 * `time` is measured in ticks and may be fractional; the view shows frames[floor(time)]
 * blended towards the next one. A frame's events are emitted once, when `time` first reaches
 * that frame's index. While the run is still streaming, playback waits at the newest frame.
 *
 * Beside the frames, a line cursor over the script's LineRecords (frame index = tick): playing
 * keeps it on the last line started by the shown tick. step() moves it to the next line: at once if
 * that line starts at the same tick, else by playing (at the current speed) up to its tick. After
 * the last line of a finished run, the end of the run is the last step.
 */
import type { Frame, LineRecord } from '../shared/frames';
import { TICK_RATE } from '../shared/geometry';
import type { PlaybackSpeed } from '../shared/save';

export interface PlaybackUpdate {
  /** Frames whose events became due during this update, in order. */
  reached: Frame[];
  /** True exactly once, when playback hits the last frame of a finished run. */
  ended: boolean;
}

export class PlaybackClock {
  readonly frames: Frame[] = [];
  readonly lines: LineRecord[] = [];
  /** Index into `lines` of the current line, -1 before the first. */
  lineIndex = -1;
  /** A step is playing up to the next line (or the end of the run). Cleared by play/pause. */
  stepping = false;
  time = 0;
  speed: PlaybackSpeed = 1;
  playing = false;
  /** The producer will not send more frames. */
  finished = false;
  private emitted = -1;
  private endSignalled = false;

  get lastIndex(): number {
    return this.frames.length - 1;
  }

  /** Index of the frame currently shown (whole ticks). */
  get index(): number {
    return Math.floor(this.time);
  }

  /** Line of the script the shown tick is on, or null (none yet, or no line records). */
  get line(): number | null {
    return this.lines[this.lineIndex]?.line ?? null;
  }

  /** Time is moving: playing, or a step playing up to its line. */
  get moving(): boolean {
    return this.playing || this.stepping;
  }

  get atEnd(): boolean {
    return this.finished && this.frames.length > 0 && this.time >= this.lastIndex;
  }

  /** The end was signalled (playback reached the last frame and every line up to it). */
  get ended(): boolean {
    return this.endSignalled;
  }

  play(): void {
    this.stepping = false;
    this.playing = true;
  }

  /** Stop where it is, including a step playing up to its line. */
  pause(): void {
    this.playing = false;
    this.stepping = false;
  }

  push(frames: readonly Frame[], lines: readonly LineRecord[] = []): void {
    for (const f of frames) this.frames.push(f);
    for (const l of lines) this.lines.push(l);
  }

  finish(): void {
    this.finished = true;
  }

  /** Drop everything, ready for a new run. */
  clear(): void {
    this.frames.length = 0;
    this.lines.length = 0;
    this.finished = false;
    this.rewind();
  }

  /** Seek back to tick 0 keeping the frames (replay). Frame 0's events will be emitted again. */
  rewind(): void {
    this.time = 0;
    this.lineIndex = -1;
    this.stepping = false;
    this.emitted = -1;
    this.endSignalled = false;
  }

  /** Advance by `dtMs` of wall time (only while moving) and report what became due. */
  advance(dtMs: number): PlaybackUpdate {
    if (this.moving && this.frames.length > 0) {
      this.time = Math.min(this.time + (dtMs / 1000) * TICK_RATE * this.speed, this.lastIndex);
      if (this.stepping) {
        const tick = this.nextTick()!;
        if (this.time >= tick) {
          this.time = tick; // stop at the step's tick, not past it
          this.arrive();
        }
      } else {
        while (this.lineIndex + 1 < this.lines.length && this.lines[this.lineIndex + 1]!.tick <= this.index) this.lineIndex++;
      }
    }
    return this.collect();
  }

  /**
   * Pause and move to the next line of the script: at once if it starts at the shown tick, else
   * play up to the tick it starts at (see advance). Stepping again while a step plays finishes it
   * at once. After the last line of a finished run the step plays to its end; while frames are
   * still streaming with no next line received yet (or with no line records at all) step one tick.
   */
  step(): PlaybackUpdate {
    this.playing = false;
    if (!this.stepping) {
      // Lines for earlier ticks that arrived after a one-tick step (at the streaming frontier) are past.
      while (this.lineIndex + 1 < this.lines.length && this.lines[this.lineIndex + 1]!.tick < this.index) this.lineIndex++;
      const tick = this.nextTick();
      if (tick === null) {
        if (this.frames.length > 0) this.time = Math.min(this.index + 1, this.lastIndex);
        return this.collect();
      }
      if (tick > this.index) {
        this.stepping = true;
        return this.collect();
      }
    }
    this.arrive();
    return this.collect();
  }

  /** Tick of the next step's target: the next line, else the end of a finished run, else null. */
  private nextTick(): number | null {
    const next = this.lines[this.lineIndex + 1];
    if (next && next.tick <= this.lastIndex) return next.tick;
    return this.finished && this.frames.length > 0 ? this.lastIndex : null;
  }

  /** A step reached its target: show the next line (or the last frame) at its tick, paused. */
  private arrive(): void {
    const tick = this.nextTick()!;
    this.stepping = false;
    if (this.lines[this.lineIndex + 1]?.tick === tick) this.lineIndex++;
    this.time = Math.max(this.index, tick);
  }

  private collect(): PlaybackUpdate {
    const reached: Frame[] = [];
    const upTo = this.frames.length > 0 ? this.index : -1;
    while (this.emitted < upTo) {
      this.emitted++;
      reached.push(this.frames[this.emitted]!);
    }
    let ended = false;
    // Lines at the last tick still to step through come first (the result would cover them).
    const lineLeft = (this.lines[this.lineIndex + 1]?.tick ?? Infinity) <= this.lastIndex;
    if (this.atEnd && !lineLeft && !this.endSignalled) {
      this.endSignalled = true;
      this.playing = false;
      ended = true;
    }
    return { reached, ended };
  }
}
