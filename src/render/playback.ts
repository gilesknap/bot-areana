/**
 * Playback clock over an append-only frame buffer. Pure (no Phaser), so it is unit-tested.
 *
 * `time` is measured in ticks and may be fractional; the view shows frames[floor(time)]
 * blended towards the next one. A frame's events are emitted once, when `time` first reaches
 * that frame's index. While the run is still streaming, playback waits at the newest frame.
 */
import type { Frame } from '../shared/frames';
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

  get atEnd(): boolean {
    return this.finished && this.frames.length > 0 && this.time >= this.lastIndex;
  }

  push(frames: readonly Frame[]): void {
    for (const f of frames) this.frames.push(f);
  }

  finish(): void {
    this.finished = true;
  }

  /** Drop everything, ready for a new run. */
  clear(): void {
    this.frames.length = 0;
    this.finished = false;
    this.rewind();
  }

  /** Seek back to tick 0 keeping the frames (replay). Frame 0's events will be emitted again. */
  rewind(): void {
    this.time = 0;
    this.emitted = -1;
    this.endSignalled = false;
  }

  /** Advance by `dtMs` of wall time (only while playing) and report what became due. */
  advance(dtMs: number): PlaybackUpdate {
    if (this.playing && this.frames.length > 0) {
      this.time = Math.min(this.time + (dtMs / 1000) * TICK_RATE * this.speed, this.lastIndex);
    }
    return this.collect();
  }

  /** Pause and move forward exactly one tick (snapping to whole ticks). */
  step(): PlaybackUpdate {
    this.playing = false;
    if (this.frames.length > 0) this.time = Math.min(this.index + 1, this.lastIndex);
    return this.collect();
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
