/**
 * Playback clock over an append-only frame buffer. Pure (no Phaser), so it is unit-tested.
 *
 * `time` is measured in ticks and may be fractional; the view shows frames[floor(time)]
 * blended towards the next one. A frame's events are emitted once, when `time` first reaches
 * that frame's index. While the run is still streaming, playback waits at the newest frame.
 *
 * Beside the frames, a line cursor over the script's LineRecords (frame index = tick): playing
 * keeps it on the last line started by the shown tick. step() moves it to the next line: at once if
 * that line starts at the same tick, else by playing (at the current speed) up to its tick.
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
  /** While a step plays up to a later line: that line's index in `lines`. Cleared by play/pause. */
  stepTo: number | null = null;
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
    return this.playing || this.stepTo !== null;
  }

  get atEnd(): boolean {
    return this.finished && this.frames.length > 0 && this.time >= this.lastIndex;
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
    this.stepTo = null;
    this.emitted = -1;
    this.endSignalled = false;
  }

  /** Advance by `dtMs` of wall time (only while moving) and report what became due. */
  advance(dtMs: number): PlaybackUpdate {
    if (this.moving && this.frames.length > 0) {
      this.time = Math.min(this.time + (dtMs / 1000) * TICK_RATE * this.speed, this.lastIndex);
      if (this.stepTo !== null) {
        const tick = this.lines[this.stepTo]!.tick;
        if (this.time >= tick) {
          this.time = tick; // stop at the line's tick, not past it
          this.arrive(this.stepTo);
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
   * at once. With no next line received (the script has ended, or no line records) step one tick.
   */
  step(): PlaybackUpdate {
    this.playing = false;
    if (this.stepTo !== null) {
      this.arrive(this.stepTo);
      return this.collect();
    }
    const next = this.lines[this.lineIndex + 1];
    if (next && next.tick <= this.lastIndex) {
      if (next.tick <= this.index) this.arrive(this.lineIndex + 1);
      else this.stepTo = this.lineIndex + 1;
    } else if (this.frames.length > 0) {
      this.time = Math.min(this.index + 1, this.lastIndex);
    }
    return this.collect();
  }

  /** A step reached its line: show that line at its tick (whole ticks), paused. */
  private arrive(index: number): void {
    this.stepTo = null;
    this.lineIndex = index;
    this.time = Math.max(this.index, this.lines[index]!.tick);
  }

  private collect(): PlaybackUpdate {
    const reached: Frame[] = [];
    const upTo = this.frames.length > 0 ? this.index : -1;
    while (this.emitted < upTo) {
      this.emitted++;
      reached.push(this.frames[this.emitted]!);
    }
    let ended = false;
    if (this.atEnd && !this.endSignalled) {
      this.endSignalled = true;
      this.playing = false;
      ended = true;
    }
    return { reached, ended };
  }
}
