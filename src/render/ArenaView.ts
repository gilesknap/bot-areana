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
import type { Frame, LineRecord, SimEvent, WorldInit } from '../shared/frames';
import type { LevelDef } from '../shared/level';
import { PALETTE } from '../shared/palette';
import type { PlaybackSpeed } from '../shared/save';
import { ArenaScene } from './scene';

type Unsubscribe = () => void;

let software: boolean | undefined;
/**
 * True when WebGL has no GPU behind it (software rendering, as in headless CI or on a
 * blocklisted GPU). The browser then composites in software and reads every WebGL frame back
 * on the main thread, so a hall animating while idle keeps the whole page busy (measured in CI:
 * ~140 ms per frame, so clicks and typing waited seconds).
 */
function softwareWebGL(): boolean {
  if (software === undefined) {
    const gl = document.createElement('canvas').getContext('webgl');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    software = /swiftshader|llvmpipe|softpipe|software/i.test(renderer);
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

  constructor(private readonly parent: HTMLElement) {
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
        // Zoom after resizing: in Scale.NONE, resize() leaves the canvas's CSS size alone when it
        // equals the new pixel size (zoom 1, so at devicePixelRatio 1 the canvas kept its old CSS
        // size and was stretched or clipped); setZoom() always sets it from the new size.
        this.game.scale.resize(Math.round(w * dpr), Math.round(h * dpr));
        this.game.scale.setZoom(1 / dpr);
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
    return this.booted.then(async () => {
      if (seq !== this.loadSeq) return;
      await this.scene.build(level, world);
      this.parent.dataset.drawn = ''; // e2e tests wait for the first hall
    });
  }

  /** Append frames from the running match (in tick order), and the script lines started meanwhile. */
  push(frames: readonly Frame[], lines: readonly LineRecord[] = []): void {
    this.clock.push(frames, lines);
  }

  /** The match is over and every frame has been pushed. */
  finish(): void {
    this.clock.finish();
  }

  play(): void {
    if (this.clock.atEnd) this.rewind();
    this.clock.stepTo = null;
    this.clock.playing = true;
    this.scene.wake();
  }

  /** Stop where it is, including a step playing up to its line. */
  pause(): void {
    this.clock.playing = false;
    this.clock.stepTo = null;
  }

  /**
   * Pause and move to the next line of the script, playing up to it at the current speed if it
   * starts later (a second step finishes that at once); one tick if there is no next line.
   */
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

  /** The script line shown changed (null: none, e.g. after a reset or rewind). */
  onLine(cb: (line: number | null) => void): Unsubscribe {
    this.scene.listeners.line.add(cb);
    return () => this.scene.listeners.line.delete(cb);
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
