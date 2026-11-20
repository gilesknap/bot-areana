/**
 * Public face of the arena renderer: a Phaser game in a DOM element that plays back frames.
 *
 *   const view = new ArenaView(el);
 *   view.load(level, world);          // on PythonRunner 'started'
 *   view.push(frames); view.play();   // on 'frames'
 *   view.finish();                    // on 'done' (so onEnd can fire at the last frame)
 *
 * Pause / step / speed / rewind only change playback of frames already received.
 */
import Phaser from 'phaser';
import type { Frame, SimEvent, WorldInit } from '../shared/frames';
import type { LevelDef } from '../shared/level';
import { PALETTE } from '../shared/palette';
import type { PlaybackSpeed } from '../shared/save';
import { ArenaScene } from './scene';

type Unsubscribe = () => void;

let software: boolean | undefined;
/**
 * True when WebGL has no GPU behind it (software rendering, as in CI or on a blocklisted GPU).
 * The browser then reads every WebGL frame back on the main thread, so a hall animating while
 * idle keeps the whole page busy (measured in CI: ~140 ms per frame, the page stalled for seconds).
 */
function softwareWebGL(): boolean {
  if (software === undefined) {
    const gl = document.createElement('canvas').getContext('webgl', { failIfMajorPerformanceCaveat: true });
    software = !gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
  return software;
}

export class ArenaView {
  private game?: Phaser.Game;
  private sized: ResizeObserver;
  private scene: ArenaScene;
  private booted: Promise<void>;
  private loadSeq = 0;

  constructor(parent: HTMLElement) {
    this.scene = new ArenaScene();
    this.scene.lowPower = softwareWebGL();
    this.booted = new Promise((resolve) => (this.scene.onBoot = resolve));
    // Phaser sizes its WebGL render targets from the parent when it boots, and fails on a 0x0
    // parent (one not yet in the page), so wait until the parent has a size. The canvas has
    // devicePixelRatio pixels per CSS pixel (zoom 1/dpr shrinks it back), so it is crisp on HiDPI.
    this.sized = new ResizeObserver(() => {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      if (this.game) {
        this.game.scale.setZoom(1 / dpr);
        this.game.scale.resize(Math.round(w * dpr), Math.round(h * dpr));
        this.scene.wake();
        return;
      }
      this.game = new Phaser.Game({
        type: Phaser.AUTO,
        parent,
        backgroundColor: PALETTE.hallFloor,
        scene: this.scene,
        banner: false,
        antialias: true,
        scale: { mode: Phaser.Scale.NONE, width: Math.round(w * dpr), height: Math.round(h * dpr), zoom: 1 / dpr },
        render: { antialiasGL: true, powerPreference: 'high-performance' },
        audio: { noAudio: true },
      });
    });
    this.sized.observe(parent);
  }

  private get clock() {
    return this.scene.clock;
  }

  /** Show a level's hall with every bot at its start pose. Discards any previous run. */
  load(level: LevelDef, world: WorldInit): Promise<void> {
    const seq = ++this.loadSeq;
    this.clock.clear();
    return this.booted.then(() => (seq === this.loadSeq ? this.scene.build(level, world) : undefined));
  }

  /** Append frames from the running match (in tick order). */
  push(frames: readonly Frame[]): void {
    this.clock.push(frames);
  }

  /** The match is over and every frame has been pushed. */
  finish(): void {
    this.clock.finish();
  }

  play(): void {
    if (this.clock.atEnd) this.rewind();
    this.clock.playing = true;
    this.scene.wake();
  }

  pause(): void {
    this.clock.playing = false;
  }

  /** Pause and advance exactly one tick. */
  step(): void {
    this.clock.playing = false;
    this.scene.requestStep();
  }

  setSpeed(speed: PlaybackSpeed): void {
    this.clock.speed = speed;
  }

  /** Replay the same frames from tick 0. */
  rewind(): void {
    this.scene.rewind();
  }

  /** Discard the run and show the level at its start (ready for the next run). */
  reset(): void {
    this.clock.playing = false;
    this.scene.clearRun();
  }

  get playing(): boolean {
    return this.clock.playing;
  }

  get speed(): PlaybackSpeed {
    return this.clock.speed;
  }

  /** Tick currently displayed. */
  get tick(): number {
    return this.clock.frames[this.clock.index]?.tick ?? 0;
  }

  /** Newest tick received so far. */
  get bufferedTick(): number {
    return this.clock.frames[this.clock.lastIndex]?.tick ?? 0;
  }

  onTick(cb: (tick: number, frame: Frame) => void): Unsubscribe {
    this.scene.listeners.tick.add(cb);
    return () => this.scene.listeners.tick.delete(cb);
  }

  /** Fired as playback reaches each event (print, objective, hit, ...). */
  onEvent(cb: (event: SimEvent, tick: number) => void): Unsubscribe {
    this.scene.listeners.event.add(cb);
    return () => this.scene.listeners.event.delete(cb);
  }

  /** Playback reached the last frame of a finished run. */
  onEnd(cb: () => void): Unsubscribe {
    this.scene.listeners.end.add(cb);
    return () => this.scene.listeners.end.delete(cb);
  }

  destroy(): void {
    this.sized.disconnect();
    this.game?.destroy(true);
    this.game?.loop.wake(); // Phaser destroys the game on its next step: a sleeping loop never takes one
  }
}
