/**
 * Phaser scene that draws the "test hall" and plays back a frame stream with effects.
 * Owned and driven by ArenaView; all state changes come through its public methods.
 */
import Phaser from 'phaser';
import { CHASSIS, PARTS } from '../parts/catalogue';
import type { BotFrame, Frame, ProjectileFrame, SimEvent, Team, WorldInit } from '../shared/frames';
import { distance, headingTo, headingVector, normaliseBearing, TICK_RATE } from '../shared/geometry';
import type { LevelDef } from '../shared/level';
import { PALETTE } from '../shared/palette';
import { SLOT_ANGLE } from '../shared/parts';
import { FX_RES, makeFxTextures } from './fxTextures';
import { botBody, botHalfExtent, HULL } from './glyphs';
import { HALL_MARGIN, paintHall, paintLavaGlow, rng, terrainGrid } from './hall';
import { stateAt, type InterpolatedState } from './interp';
import { PlaybackClock } from './playback';

const BOT_RES = 4;
const hex = (c: string) => parseInt(c.slice(1), 16);
const COL = {
  cyan: hex(PALETTE.cyan),
  amber: hex(PALETTE.amber),
  signal: hex(PALETTE.signal),
  alert: hex(PALETTE.alert),
  core: hex(PALETTE.core),
  white: 0xffffff,
  smoke: 0x8a97a6,
  lava: 0xff6a2a,
};
const D = {
  hall: 0,
  terrainFx: 1,
  decals: 2,
  markers: 3,
  shadows: 4,
  beams: 5,
  sweep: 6,
  bots: 7,
  shields: 8,
  overlay: 9,
  projectiles: 10,
  particles: 11,
  smoke: 12,
  text: 13,
  vignette: 14,
};

export interface SceneListeners {
  tick: Set<(tick: number, frame: Frame) => void>;
  event: Set<(event: SimEvent, tick: number) => void>;
  end: Set<() => void>;
}

interface Fx {
  age: number;
  life: number;
  tick(f: number, fx: Fx): void;
  end?(): void;
}

interface BotView {
  init: WorldInit['bots'][number];
  team: Team;
  radius: number;
  turret: boolean;
  hover: boolean;
  /** Half width / length of the hull (tread spacing, slot positions). */
  hw: number;
  hh: number;
  shadow: Phaser.GameObjects.Image;
  beam?: Phaser.GameObjects.Image;
  base?: Phaser.GameObjects.Image;
  body: Phaser.GameObjects.Image;
  led?: Phaser.GameObjects.Image;
  shield: Phaser.GameObjects.Image;
  shieldRing: Phaser.GameObjects.Image;
  lastMark?: { x: number; y: number };
  flashMs: number;
  recoil: number;
  dying?: { cause: 'damage' | 'pit' | 'lava'; age: number };
  current?: BotFrame;
}

interface ProjectileView {
  glow: Phaser.GameObjects.Image;
  core: Phaser.GameObjects.Image;
  colour: number;
  trail: Array<{ x: number; y: number }>;
}

interface MarkerView {
  kind: 'flag' | 'waypoint' | 'core';
  x: number;
  y: number;
  ring: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  g: Phaser.GameObjects.Graphics;
  label?: Phaser.GameObjects.Text;
  state: 'idle' | 'reached' | 'collected';
  index: number;
}

interface Emitters {
  sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  fire: Phaser.GameObjects.Particles.ParticleEmitter;
  smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  debris: Phaser.GameObjects.Particles.ParticleEmitter;
  embers: Phaser.GameObjects.Particles.ParticleEmitter;
  dust: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Ambient emitters below run on real time. */
  motes: Phaser.GameObjects.Particles.ParticleEmitter;
  lavaEmbers: Phaser.GameObjects.Particles.ParticleEmitter;
}
const AMBIENT = new Set(['motes', 'lavaEmbers']);

async function rasterise(textures: Phaser.Textures.TextureManager, key: string, svgMarkup: string, px: number): Promise<void> {
  if (textures.exists(key)) return;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgMarkup);
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  canvas.getContext('2d')!.drawImage(img, 0, 0, px, px);
  if (!textures.exists(key)) textures.addCanvas(key, canvas);
}

function botTexture(textures: Phaser.Textures.TextureManager, bot: WorldInit['bots'][number], layer: 'all' | 'base' | 'top'): Promise<string> {
  const key = `bot:${bot.team}:${layer}:${JSON.stringify(bot.design)}`;
  const h = botHalfExtent(bot.design.chassis);
  const px = Math.round(2 * h * BOT_RES);
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="${-h} ${-h} ${2 * h} ${2 * h}" fill="none">${botBody(bot.design, bot.team, layer)}</svg>`;
  return rasterise(textures, key, markup, px).then(() => key);
}

/** The hall stencil and labels are painted into canvases, so their web fonts must be ready first. */
function loadFonts(): Promise<unknown> {
  const fonts = document.fonts;
  if (!fonts) return Promise.resolve();
  const wanted = Promise.all([fonts.load("700 100px 'Space Grotesk'"), fonts.load("10px 'JetBrains Mono'")]).catch(() => undefined);
  return Promise.race([wanted, new Promise((r) => setTimeout(r, 1500))]);
}

export class ArenaScene extends Phaser.Scene {
  readonly clock = new PlaybackClock();
  listeners: SceneListeners = { tick: new Set(), event: new Set(), end: new Set() };
  onBoot?: () => void;

  private world?: WorldInit;
  private ready = false;
  private buildToken = 0;
  private stepRequested = false;
  private realTime = 0;

  private bots = new Map<string, BotView>();
  private projectiles = new Map<number, ProjectileView>();
  private markers = new Map<string, MarkerView>();
  private fx: Fx[] = [];
  private wreckSmoke: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private emitters?: Emitters;
  private decals?: Phaser.GameObjects.RenderTexture;
  private decalRes = 1;
  private overlay?: Phaser.GameObjects.Graphics;
  private trails?: Phaser.GameObjects.Graphics;
  private terrainG?: Phaser.GameObjects.Graphics;
  private lavaGlow?: Phaser.GameObjects.Image;
  private corners: Phaser.GameObjects.Image[] = [];
  private lock?: { brackets: Phaser.GameObjects.Image[]; text: Phaser.GameObjects.Text; target?: string; t: number };
  private lavaTiles: Array<{ x: number; y: number; w: number; h: number }> = [];
  private waterTiles: Array<{ x: number; y: number; w: number; h: number }> = [];
  private bubbles: Array<{ x: number; y: number; r: number; age: number; life: number }> = [];
  private rand = rng(1);

  constructor() {
    super({ key: 'arena' });
  }

  create(): void {
    makeFxTextures(this.textures);
    this.scale.on('resize', () => this.fitCamera());
    this.cameras.main.setBackgroundColor(PALETTE.hallFloor);
    this.onBoot?.();
  }

  // ---- Commands from ArenaView ---------------------------------------------------------------

  /** Build the hall for a level. Frames pushed meanwhile are kept and played once ready. */
  async build(level: LevelDef, world: WorldInit): Promise<void> {
    const token = ++this.buildToken;
    this.ready = false;
    this.world = world;
    await loadFonts();
    const keys = await Promise.all(
      world.bots.map(async (b) => ({
        id: b.id,
        body: await botTexture(this.textures, b, b.design.chassis === 'turret_base' ? 'top' : 'all'),
        base: b.design.chassis === 'turret_base' ? await botTexture(this.textures, b, 'base') : undefined,
      })),
    );
    if (token !== this.buildToken || !this.sys.isActive()) return;
    this.teardown();
    this.rand = rng(world.seed + 17);
    this.buildHall(level, world);
    this.buildMarkers(world);
    for (const k of keys) this.buildBot(world.bots.find((b) => b.id === k.id)!, k.body, k.base);
    this.buildEmitters();
    this.fitCamera();
    this.ready = true;
    this.renderState(this.currentState());
  }

  requestStep(): void {
    this.stepRequested = true;
  }

  /** Back to tick 0 (frames kept): clears decals, wrecks and effects so the replay starts clean. */
  rewind(): void {
    this.clearDynamic();
    this.clock.rewind();
    if (this.ready) this.renderState(this.currentState());
  }

  /** Drop the run's frames and show the world at its start. */
  clearRun(): void {
    this.clearDynamic();
    this.clock.clear();
    if (this.ready) this.renderState(this.currentState());
  }

  // ---- Frame loop ----------------------------------------------------------------------------

  override update(_time: number, delta: number): void {
    this.realTime += delta;
    if (!this.ready) return;
    let fxDt: number;
    let upd;
    if (this.stepRequested) {
      this.stepRequested = false;
      upd = this.clock.step();
      fxDt = 1000 / TICK_RATE;
    } else {
      const playing = this.clock.playing;
      upd = this.clock.advance(delta);
      fxDt = playing ? delta * this.clock.speed : 0;
    }
    for (const frame of upd.reached) this.handleFrame(frame);
    const last = upd.reached[upd.reached.length - 1];
    if (last) for (const cb of this.listeners.tick) cb(last.tick, last);

    // Particles and effects run on playback time, so they freeze on pause and speed up at 4x.
    const scale = delta > 0 ? fxDt / delta : 0;
    if (this.emitters) for (const [k, e] of Object.entries(this.emitters)) if (!AMBIENT.has(k)) e.timeScale = scale;
    for (const e of this.wreckSmoke) e.timeScale = scale;

    this.overlay?.clear();
    this.stepFx(fxDt);
    this.ambient(delta, fxDt);
    this.renderState(this.currentState(), fxDt);
    if (upd.ended) for (const cb of this.listeners.end) cb();
  }

  private currentState(): InterpolatedState {
    const s = stateAt(this.clock.frames, this.clock.time);
    if (s) return s;
    return {
      tick: 0,
      projectiles: [],
      bots: (this.world?.bots ?? []).map((b) => ({
        id: b.id,
        x: b.start.x,
        y: b.start.y,
        heading: b.start.heading,
        hp: b.maxHp,
        energy: b.maxEnergy,
        shield: false,
        alive: true,
        moving: false,
      })),
    };
  }

  // ---- Building ------------------------------------------------------------------------------

  private teardown(): void {
    this.clearDynamic();
    this.children.removeAll(true);
    this.bots.clear();
    this.markers.clear();
    this.corners = [];
    this.emitters = undefined;
    this.lock = undefined;
    for (const k of ['hall', 'hall-lava']) if (this.textures.exists(k)) this.textures.remove(k);
  }

  private buildHall(level: LevelDef, world: WorldInit): void {
    const M = HALL_MARGIN;
    const fullW = world.width + 2 * M;
    const fullH = world.height + 2 * M;
    const res = Math.min(2, 4096 / Math.max(fullW, fullH));
    const player = world.bots.find((b) => b.team === 'player');
    const input = { level, world, spawn: level.spawn ?? player?.start ?? { x: 60, y: 60, heading: 0 } };

    const hall = this.textures.createCanvas('hall', Math.ceil(fullW * res), Math.ceil(fullH * res))!;
    paintHall(hall.context, input, res);
    hall.refresh();
    this.add.image(-M, -M, 'hall').setOrigin(0).setScale(1 / res).setDepth(D.hall);

    const grid = terrainGrid(level);
    this.lavaTiles = grid.tiles('lava');
    this.waterTiles = grid.tiles('water');
    if (this.lavaTiles.length) {
      const glow = this.textures.createCanvas('hall-lava', Math.ceil(fullW * res), Math.ceil(fullH * res))!;
      paintLavaGlow(glow.context, input, res);
      glow.refresh();
      this.lavaGlow = this.add
        .image(-M, -M, 'hall-lava')
        .setOrigin(0)
        .setScale(1 / res)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(D.terrainFx);
    } else {
      this.lavaGlow = undefined;
    }
    this.terrainG = this.add.graphics().setDepth(D.terrainFx);

    this.decalRes = Math.min(2, 4096 / Math.max(world.width, world.height));
    this.decals = this.add
      .renderTexture(0, 0, Math.ceil(world.width * this.decalRes), Math.ceil(world.height * this.decalRes))
      .setOrigin(0)
      .setScale(1 / this.decalRes)
      .setDepth(D.decals);

    // Glowing corner lights on the outer wall.
    for (const [x, y] of [
      [-M / 2, -M / 2],
      [world.width + M / 2, -M / 2],
      [-M / 2, world.height + M / 2],
      [world.width + M / 2, world.height + M / 2],
    ] as const) {
      this.corners.push(this.add.image(x, y, 'fx-glow').setTint(COL.amber).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(40, 40).setDepth(D.overlay));
      this.add.image(x, y, 'fx-dot').setTint(0xffd27a).setDisplaySize(9, 9).setDepth(D.overlay);
    }

    this.overlay = this.add.graphics().setDepth(D.overlay);
    this.trails = this.add.graphics().setDepth(D.projectiles).setBlendMode(Phaser.BlendModes.ADD);

    const brackets = [0, 1, 2, 3].map((i) =>
      this.add.image(0, 0, 'fx-bracket').setOrigin(0).setAngle(i * 90).setDisplaySize(16, 16).setDepth(D.text).setVisible(false),
    );
    const text = this.add
      .text(0, 0, '', { fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: PALETTE.cyan, resolution: 3 })
      .setLetterSpacing(1)
      .setOrigin(0.5, 1)
      .setDepth(D.text)
      .setVisible(false);
    this.lock = { brackets, text, t: 0 };

    this.add
      .image(-M, -M, 'fx-vignette')
      .setOrigin(0)
      .setDisplaySize(fullW, fullH)
      .setDepth(D.vignette);
  }

  private buildMarkers(world: WorldInit): void {
    world.markers.forEach((m, i) => {
      const colour = m.kind === 'flag' ? COL.signal : m.kind === 'waypoint' ? COL.cyan : COL.core;
      const glow = this.add.image(m.x, m.y, 'fx-glow').setTint(colour).setAlpha(0.22).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(90, 90).setDepth(D.markers);
      const ring = this.add.image(m.x, m.y, 'fx-dashring').setTint(colour).setAlpha(0.8).setDisplaySize(m.kind === 'waypoint' ? 50 : 54, m.kind === 'waypoint' ? 50 : 54).setDepth(D.markers);
      const g = this.add.graphics().setDepth(D.markers);
      let label: Phaser.GameObjects.Text | undefined;
      const index = m.index ?? i + 1;
      if (m.kind === 'waypoint') {
        label = this.add
          .text(m.x, m.y, String(index), { fontFamily: "'JetBrains Mono', monospace", fontSize: '14px', color: PALETTE.cyan, resolution: 3 })
          .setOrigin(0.5)
          .setDepth(D.markers);
      }
      this.markers.set(m.id, { kind: m.kind, x: m.x, y: m.y, ring, glow, g, label, state: 'idle', index });
    });
  }

  private buildBot(init: WorldInit['bots'][number], bodyKey: string, baseKey?: string): void {
    const chassis = CHASSIS[init.design.chassis];
    const turret = init.design.chassis === 'turret_base';
    const hull = turret ? { hw: 14, hh: 14 } : HULL[init.design.chassis as keyof typeof HULL];
    const radius = chassis.radius;
    const hover = init.design.drive === 'hover';
    const shadow = this.add
      .image(0, 0, 'fx-shadow')
      .setDisplaySize(radius * 2.7, radius * 2.7)
      .setAlpha(hover ? 0.45 : 0.75)
      .setDepth(D.shadows);
    let beam: Phaser.GameObjects.Image | undefined;
    if (!turret && init.design.drive) {
      beam = this.add
        .image(0, 0, 'fx-beam')
        .setOrigin(0.5, 1)
        .setScale(1 / FX_RES)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(D.beams);
      if (init.team === 'enemy') beam.setTint(0xffd9a0).setAlpha(0.45);
    }
    const base = baseKey ? this.add.image(init.start.x, init.start.y, baseKey).setScale(1 / BOT_RES).setDepth(D.bots) : undefined;
    const body = this.add.image(init.start.x, init.start.y, bodyKey).setScale(1 / BOT_RES).setDepth(D.bots + 0.1);
    const led = turret ? this.add.image(0, 0, 'fx-glow').setTint(COL.alert).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(18, 18).setDepth(D.bots + 0.2) : undefined;
    const shieldSize = radius * 2 + 22;
    const shield = this.add.image(0, 0, 'fx-shield').setTint(COL.amber).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(shieldSize, shieldSize).setDepth(D.shields).setVisible(false);
    const shieldRing = this.add.image(0, 0, 'fx-dashring').setTint(COL.amber).setAlpha(0.7).setDisplaySize(shieldSize + 4, shieldSize + 4).setDepth(D.shields).setVisible(false);
    this.bots.set(init.id, { init, team: init.team, radius, turret, hover, hw: hull.hw, hh: hull.hh, shadow, beam, base, body, led, shield, shieldRing, flashMs: 0, recoil: 0 });
  }

  private buildEmitters(): void {
    const p = (key: string, depth: number, cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig) =>
      this.add.particles(0, 0, key, { emitting: false, ...cfg }).setDepth(depth);
    const W = this.world!.width;
    const H = this.world!.height;
    this.emitters = {
      sparks: p('fx-dot', D.particles, {
        speed: { min: 90, max: 300 },
        lifespan: { min: 200, max: 520 },
        scale: { start: 0.45, end: 0 },
        tint: [0xffffff, 0xffe2a8, COL.amber],
        blendMode: 'ADD',
      }),
      fire: p('fx-glow', D.particles, {
        speed: { min: 30, max: 150 },
        lifespan: { min: 350, max: 750 },
        scale: { start: 0.9, end: 0.1 },
        alpha: { start: 0.95, end: 0 },
        tint: [0xfff1c2, 0xffb547, 0xff6a2a, 0xff8a3d],
        blendMode: 'ADD',
      }),
      smoke: p('fx-smoke', D.smoke, {
        speed: { min: 8, max: 40 },
        lifespan: { min: 1100, max: 2100 },
        scale: { start: 0.45, end: 1.6 },
        alpha: { start: 0.55, end: 0 },
        tint: COL.smoke,
        rotate: { min: 0, max: 360 },
      }),
      debris: p('fx-shard', D.particles, {
        speed: { min: 60, max: 200 },
        lifespan: { min: 500, max: 900 },
        alpha: { start: 1, end: 0 },
        rotate: { start: 0, end: 540 },
        scale: { min: 0.8, max: 1.6 },
        tint: [0x5a6b7c, 0x3a4655, 0x5a4520],
      }),
      embers: p('fx-dot', D.particles, {
        speed: { min: 10, max: 40 },
        angle: { min: 240, max: 300 },
        lifespan: { min: 500, max: 1100 },
        scale: { start: 0.35, end: 0 },
        tint: [0xffe29a, 0xff8a3d],
        blendMode: 'ADD',
      }),
      dust: p('fx-smoke', D.shadows, {
        speed: { min: 4, max: 16 },
        lifespan: { min: 400, max: 800 },
        scale: { start: 0.2, end: 0.55 },
        alpha: { start: 0.25, end: 0 },
        tint: 0x6b7c8d,
      }),
      motes: this.add
        .particles(0, 0, 'fx-dot', {
          x: { min: 0, max: W },
          y: { min: 0, max: H },
          speedX: { min: -4, max: 4 },
          speedY: { min: -3, max: 3 },
          lifespan: 9000,
          frequency: 220,
          scale: { min: 0.08, max: 0.16 },
          alpha: { onEmit: () => 0, onUpdate: (_p, _k, t) => Math.sin(t * Math.PI) * 0.22 },
          tint: 0xc9d4de,
        })
        .setDepth(D.smoke)
        .setAlpha(0.6),
      lavaEmbers: p('fx-dot', D.particles, {
        speed: { min: 10, max: 35 },
        angle: { min: 240, max: 300 },
        lifespan: { min: 500, max: 1000 },
        scale: { start: 0.3, end: 0 },
        tint: [0xffe29a, 0xff8a3d],
        blendMode: 'ADD',
      }),
    };
    this.emitters.motes.fastForward(9000);
  }

  private fitCamera(): void {
    if (!this.world) return;
    const cam = this.cameras.main;
    const M = HALL_MARGIN;
    const w = this.world.width + 2 * M;
    const h = this.world.height + 2 * M;
    const zoom = Math.min(this.scale.width / w, this.scale.height / h);
    if (!(zoom > 0)) return;
    cam.setZoom(zoom);
    cam.centerOn(this.world.width / 2, this.world.height / 2);
  }

  // ---- Reset of per-run visuals --------------------------------------------------------------

  private clearDynamic(): void {
    for (const f of this.fx) f.end?.();
    this.fx = [];
    for (const e of this.wreckSmoke) e.destroy();
    this.wreckSmoke = [];
    for (const pv of this.projectiles.values()) {
      pv.glow.destroy();
      pv.core.destroy();
    }
    this.projectiles.clear();
    this.trails?.clear();
    this.overlay?.clear();
    this.decals?.clear();
    if (this.emitters) for (const [k, e] of Object.entries(this.emitters)) if (!AMBIENT.has(k)) e.killAll();
    for (const b of this.bots.values()) {
      b.dying = undefined;
      b.lastMark = undefined;
      b.flashMs = 0;
      b.recoil = 0;
      b.body.setAlpha(1).setScale(1 / BOT_RES).clearTint();
      b.base?.setAlpha(1).clearTint();
    }
    for (const m of this.markers.values()) m.state = 'idle';
  }

  // ---- Events --------------------------------------------------------------------------------

  private handleFrame(frame: Frame): void {
    for (const e of frame.events) {
      this.handleEvent(e, frame);
      for (const cb of this.listeners.event) cb(e, frame.tick);
    }
  }

  private botPos(id: string): { x: number; y: number; heading: number } | undefined {
    const v = this.bots.get(id);
    return v?.current ?? (v ? { x: v.init.start.x, y: v.init.start.y, heading: v.init.start.heading } : undefined);
  }

  private teamColour(team: Team | undefined): number {
    return team === 'player' ? COL.alert : COL.amber;
  }

  private handleEvent(e: SimEvent, frame: Frame): void {
    const em = this.emitters;
    if (!em) return;
    switch (e.type) {
      case 'muzzle_flash': {
        const view = this.bots.get(e.botId);
        if (view) view.recoil = 3;
        const colour = this.teamColour(view?.team);
        const v = headingVector(e.heading);
        const flash = this.add.image(e.x, e.y, 'fx-flash').setAngle(e.heading).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.projectiles).setTint(view?.team === 'player' ? 0xffe8ec : 0xfff3d6);
        const light = this.add.image(e.x, e.y, 'fx-glow').setTint(colour).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.projectiles).setDisplaySize(60, 60);
        this.addFx(110, (f) => {
          flash.setScale(0.55 + f * 0.35).setAlpha(1 - f);
          light.setAlpha(0.9 * (1 - f));
        }, () => {
          flash.destroy();
          light.destroy();
        });
        em.sparks.setParticleTint(colour);
        em.sparks.setEmitterAngle({ min: e.heading - 90 - 25, max: e.heading - 90 + 25 });
        em.sparks.explode(5, e.x + v.x * 4, e.y + v.y * 4);
        em.sparks.setEmitterAngle({ min: 0, max: 360 });
        break;
      }
      case 'hit': {
        const target = e.targetId === 'wall' ? undefined : this.bots.get(e.targetId);
        em.sparks.setParticleTint(e.shielded ? COL.amber : e.targetId === 'wall' ? 0xffe2a8 : COL.white);
        em.sparks.explode(e.targetId === 'wall' ? 8 : 14, e.x, e.y);
        const flash = this.add.image(e.x, e.y, 'fx-glow').setTint(e.shielded ? COL.amber : 0xffd0b0).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.particles).setDisplaySize(44, 44);
        this.addFx(160, (f) => flash.setAlpha(1 - f), () => flash.destroy());
        if (e.targetId === 'wall') {
          em.dust.explode(3, e.x, e.y);
          break;
        }
        if (target) {
          target.flashMs = 160;
          if (e.shielded) this.ring(target.current?.x ?? e.x, target.current?.y ?? e.y, COL.amber, target.radius + 8, target.radius + 22, 300);
        }
        if (e.damage > 0) this.floatText(e.x, e.y - 12, `-${Math.round(e.damage)}`, e.shielded ? PALETTE.amber : PALETTE.alert, 15);
        break;
      }
      case 'explosion':
        this.explode(e.x, e.y, e.size);
        break;
      case 'destroyed': {
        const view = this.bots.get(e.botId);
        if (view) view.dying = { cause: e.cause, age: 0 };
        if (e.cause === 'damage') {
          const hasExplosion = frame.events.some((x) => x.type === 'explosion' && Math.hypot(x.x - e.x, x.y - e.y) < 60);
          if (!hasExplosion) this.explode(e.x, e.y, (view?.radius ?? 20) > 24 ? 'large' : 'small');
          this.wreck(e.x, e.y, view);
        } else if (e.cause === 'lava') {
          em.embers.explode(20, e.x, e.y);
          em.smoke.explode(6, e.x, e.y);
        }
        break;
      }
      case 'scan':
        this.sweep(e.botId, e.range);
        break;
      case 'range': {
        const pos = this.botPos(e.botId);
        const view = this.bots.get(e.botId);
        if (!pos || !view) break;
        const len = Math.min(e.distance, 600);
        const hit = e.distance < 599;
        this.addFx(380, (f, fx) => {
          const p = this.botPos(e.botId) ?? pos;
          const dir = headingVector(p.heading + SLOT_ANGLE[e.slot]);
          const off = e.slot === 'front' || e.slot === 'rear' ? view.hh : view.hw;
          const sx = p.x + dir.x * off;
          const sy = p.y + dir.y * off;
          const reach = Math.min(1, fx.age / 90) * len;
          const a = 1 - f;
          this.dashedLine(sx, sy, sx + dir.x * reach, sy + dir.y * reach, COL.signal, 0.55 * a, 1.5);
          if (hit && fx.age > 90) {
            this.overlay!.fillStyle(COL.signal, 0.9 * a).fillCircle(sx + dir.x * len, sy + dir.y * len, 3);
            this.overlay!.lineStyle(1.5, COL.signal, 0.6 * a).strokeCircle(sx + dir.x * len, sy + dir.y * len, 4 + f * 10);
          }
        });
        break;
      }
      case 'bump': {
        const p = this.botPos(e.botId);
        const view = this.bots.get(e.botId);
        if (!p || !view) break;
        const dir = headingVector(p.heading + SLOT_ANGLE[e.side]);
        const off = e.side === 'front' || e.side === 'rear' ? view.hh : view.hw;
        const x = p.x + dir.x * (off + 2);
        const y = p.y + dir.y * (off + 2);
        this.ring(x, y, COL.signal, 4, 22, 280);
        em.sparks.setParticleTint(COL.signal);
        em.sparks.explode(5, x, y);
        break;
      }
      case 'shield': {
        const view = this.bots.get(e.botId);
        const p = this.botPos(e.botId);
        if (view && p) this.ring(p.x, p.y, COL.amber, e.on ? view.radius : view.radius + 14, e.on ? view.radius + 18 : view.radius + 2, 320);
        break;
      }
      case 'hazard':
        if (e.terrain === 'lava') {
          em.embers.explode(4, e.at.x, e.at.y);
          em.smoke.explode(1, e.at.x, e.at.y);
        } else if (e.terrain === 'water') {
          this.ring(e.at.x, e.at.y, hex(PALETTE.waterEdge), 6, 30, 500);
        } else if (e.terrain === 'rough') {
          em.dust.explode(3, e.at.x, e.at.y);
        }
        break;
      case 'marker': {
        const m = this.markers.get(e.markerId);
        if (!m) break;
        m.state = e.state;
        const colour = m.kind === 'core' ? COL.core : COL.signal;
        this.ring(m.x, m.y, colour, 10, 60, 600);
        em.sparks.setParticleTint(colour);
        em.sparks.explode(18, m.x, m.y);
        if (m.kind === 'core') this.floatText(m.x, m.y - 18, '+CORE', PALETTE.core, 12);
        break;
      }
      case 'low_energy': {
        const p = this.botPos(e.botId);
        if (p) this.floatText(p.x, p.y - 30, 'LOW ENERGY', PALETTE.core, 11);
        break;
      }
      default:
        break;
    }
  }

  // ---- Effect helpers ------------------------------------------------------------------------

  private addFx(life: number, tick: Fx['tick'], end?: () => void): void {
    const fx: Fx = { age: 0, life, tick, end };
    this.fx.push(fx);
    tick(0, fx);
  }

  private stepFx(dt: number): void {
    const keep: Fx[] = [];
    for (const fx of this.fx) {
      fx.age += dt;
      if (fx.age >= fx.life) {
        fx.end?.();
        continue;
      }
      fx.tick(fx.age / fx.life, fx);
      keep.push(fx);
    }
    this.fx = keep;
  }

  private ring(x: number, y: number, colour: number, r0: number, r1: number, life: number): void {
    const img = this.add.image(x, y, 'fx-ring').setTint(colour).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.particles);
    this.addFx(life, (f) => {
      const r = r0 + (r1 - r0) * Phaser.Math.Easing.Cubic.Out(f);
      img.setDisplaySize(r * 2, r * 2).setAlpha(1 - f);
    }, () => img.destroy());
  }

  private floatText(x: number, y: number, text: string, colour: string, size: number): void {
    const t = this.add
      .text(x, y, text, {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: `${size}px`,
        fontStyle: 'bold',
        color: colour,
        stroke: '#0B1016',
        strokeThickness: 3,
        resolution: 3,
      })
      .setOrigin(0.5)
      .setDepth(D.text);
    this.addFx(950, (f) => {
      t.setY(y - 26 * Phaser.Math.Easing.Cubic.Out(f));
      t.setAlpha(f < 0.6 ? 1 : 1 - (f - 0.6) / 0.4);
      t.setScale(f < 0.1 ? 0.7 + f * 4 : 1.1 - Math.min(f, 0.3) / 3);
    }, () => t.destroy());
  }

  private explode(x: number, y: number, size: 'small' | 'large'): void {
    const em = this.emitters!;
    const k = size === 'large' ? 1.8 : 1;
    const flash = this.add.image(x, y, 'fx-glow').setTint(0xffd08a).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.particles);
    this.addFx(300, (f) => flash.setDisplaySize(140 * k * (0.6 + f), 140 * k * (0.6 + f)).setAlpha(1 - f), () => flash.destroy());
    this.ring(x, y, 0xffd08a, 10, 70 * k, 420);
    em.fire.explode(Math.round(24 * k), x, y);
    em.sparks.setParticleTint(0xffe2a8);
    em.sparks.explode(Math.round(18 * k), x, y);
    em.smoke.explode(Math.round(9 * k), x, y);
    em.debris.explode(Math.round(10 * k), x, y);
    if (this.clock.playing) this.cameras.main.shake(220, 0.004 * k);
  }

  private wreck(x: number, y: number, view: BotView | undefined): void {
    const rt = this.decals!;
    const r = this.decalRes;
    const radius = view?.radius ?? 20;
    rt.stamp('fx-scorch', undefined, x * r, y * r, { scale: (radius / 36) * r, angle: this.rand() * 360 });
    rt.stamp(`fx-wreck-${view?.team ?? 'enemy'}`, undefined, x * r, y * r, { scale: (radius / 32) * r, angle: this.rand() * 360, alpha: 0.95 });
    for (let i = 0; i < 6; i++) {
      const a = this.rand() * Math.PI * 2;
      const d = radius + this.rand() * 26;
      rt.stamp('fx-shard', undefined, (x + Math.cos(a) * d) * r, (y + Math.sin(a) * d) * r, { tint: 0x4a3b22, angle: this.rand() * 360, scale: r * (0.8 + this.rand()) });
    }
    // A slow column of smoke keeps rising from the wreck.
    const column = this.add
      .particles(x, y, 'fx-smoke', {
        frequency: 240,
        lifespan: { min: 2000, max: 3200 },
        speedX: { min: 2, max: 10 },
        speedY: { min: -22, max: -10 },
        scale: { start: 0.3, end: 1.2 },
        alpha: { start: 0.24, end: 0 },
        tint: COL.smoke,
        rotate: { min: 0, max: 360 },
      })
      .setDepth(D.smoke);
    this.wreckSmoke.push(column);
  }

  private sweep(botId: string, range: number): void {
    const view = this.bots.get(botId);
    if (!view) return;
    const sweep = this.add.image(0, 0, 'fx-sweep').setBlendMode(Phaser.BlendModes.ADD).setDepth(D.sweep).setDisplaySize(range * 2, range * 2);
    const outer = this.add.image(0, 0, 'fx-dashring').setTint(COL.signal).setDepth(D.sweep).setDisplaySize(range * 2, range * 2);
    const inner = this.add.image(0, 0, 'fx-ring').setTint(COL.signal).setDepth(D.sweep).setDisplaySize(range * 1.25, range * 1.25);
    const start = (view.current?.heading ?? 0) - 90;
    this.addFx(750, (f) => {
      const p = this.botPos(botId);
      if (!p) return;
      const a = f < 0.8 ? 1 : 1 - (f - 0.8) / 0.2;
      sweep.setPosition(p.x, p.y).setAngle(start + f * 360).setAlpha(a);
      outer.setPosition(p.x, p.y).setAlpha(0.35 * a);
      inner.setPosition(p.x, p.y).setAlpha(0.12 * a);
    }, () => {
      sweep.destroy();
      outer.destroy();
      inner.destroy();
    });
  }

  private dashedLine(x1: number, y1: number, x2: number, y2: number, colour: number, alpha: number, width: number): void {
    const g = this.overlay!;
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 1) return;
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    g.lineStyle(width, colour, alpha);
    g.beginPath();
    for (let d = 0; d < len; d += 8) {
      const e = Math.min(d + 3, len);
      g.moveTo(x1 + ux * d, y1 + uy * d);
      g.lineTo(x1 + ux * e, y1 + uy * e);
    }
    g.strokePath();
  }

  // ---- Ambient animation (real time: keeps the hall alive while paused) ---------------------

  private ambient(delta: number, fxDt: number): void {
    const t = this.realTime / 1000;
    if (this.lavaGlow) this.lavaGlow.setAlpha(0.55 + 0.25 * Math.sin(t * 1.7) + 0.08 * Math.sin(t * 5.3));
    this.corners.forEach((c, i) => c.setAlpha(0.6 + 0.35 * Math.sin(t * 2.4 + i * 1.3)));

    const g = this.terrainG;
    if (!g) return;
    g.clear();
    // Water: drifting ripple lines and a soft sheen.
    for (const w of this.waterTiles) {
      for (let k = 0; k < 4; k++) {
        const y = w.y + ((k * 10 + t * 6) % 40);
        if (y < w.y + 2 || y > w.y + w.h - 2) continue;
        g.lineStyle(1, 0x1d4d7a, 0.9);
        g.beginPath();
        for (let x = 2; x <= w.w - 2; x += 6) {
          const yy = y + Math.sin((w.x + x) * 0.18 + t * 2 + k) * 1.2;
          if (x === 2) g.moveTo(w.x + x, yy);
          else g.lineTo(w.x + x, yy);
        }
        g.strokePath();
      }
      const s = 0.5 + 0.5 * Math.sin(t * 1.3 + w.x * 0.05 + w.y * 0.03);
      g.fillStyle(0x2f7bbf, 0.06 * s).fillRect(w.x + 2, w.y + 2, w.w - 4, w.h - 4);
    }
    // Lava: bubbles that swell and pop, with the odd ember.
    if (this.lavaTiles.length && this.rand() < delta / 140) {
      const tile = this.lavaTiles[Math.floor(this.rand() * this.lavaTiles.length)]!;
      this.bubbles.push({ x: tile.x + 8 + this.rand() * 24, y: tile.y + 8 + this.rand() * 24, r: 2 + this.rand() * 3.5, age: 0, life: 900 + this.rand() * 900 });
    }
    this.bubbles = this.bubbles.filter((b) => {
      b.age += delta;
      if (b.age >= b.life) {
        if (this.emitters && this.rand() < 0.4) this.emitters.lavaEmbers.explode(2, b.x, b.y);
        return false;
      }
      const f = b.age / b.life;
      const r = b.r * (0.3 + f * 0.9);
      g.lineStyle(1.3, 0xfff1c2, 0.85 * (1 - f * f)).strokeCircle(b.x, b.y, r);
      if (f > 0.85) g.fillStyle(0xfff1c2, 0.6).fillCircle(b.x, b.y, r * 0.5);
      return true;
    });
    void fxDt;
  }

  // ---- Drawing the interpolated state --------------------------------------------------------

  private renderState(state: InterpolatedState, fxDt = 0): void {
    const t = this.realTime / 1000;
    const byId = new Map(state.bots.map((b) => [b.id, b]));
    for (const [id, view] of this.bots) {
      const bf = byId.get(id);
      if (!bf) continue;
      view.current = bf;
      this.renderBot(view, bf, fxDt, t);
    }
    this.renderProjectiles(state.projectiles);
    this.renderMarkers(t);
    this.renderLock(byId, fxDt);
  }

  private renderBot(v: BotView, bf: BotFrame, fxDt: number, t: number): void {
    const objs = [v.shadow, v.beam, v.base, v.body, v.led, v.shield, v.shieldRing];
    v.flashMs = Math.max(0, v.flashMs - fxDt);
    v.recoil = Math.max(0, v.recoil - fxDt * 0.03);

    if (!bf.alive) {
      const dying = v.dying;
      if (dying && dying.cause !== 'damage' && dying.age < 900) {
        dying.age += fxDt;
        const f = Math.min(1, dying.age / 900);
        for (const o of objs) o?.setVisible(false);
        v.body.setVisible(true).setPosition(bf.x, bf.y);
        if (dying.cause === 'pit') v.body.setScale((1 - f * 0.75) / BOT_RES).setAngle(bf.heading + f * 160).setAlpha(1 - f);
        else v.body.setTint(0xff6a2a).setScale((1 - f * 0.15) / BOT_RES).setAlpha(1 - f);
      } else {
        for (const o of objs) o?.setVisible(false);
        // Turret bases stay as burnt-out husks.
        if (v.base) v.base.setVisible(true).setTint(0x555555).setAlpha(0.8);
      }
      return;
    }
    for (const o of [v.shadow, v.base, v.body]) o?.setVisible(true);
    v.body.setAlpha(1);

    const dir = headingVector(bf.heading);
    const bx = bf.x - dir.x * v.recoil;
    const by = bf.y - dir.y * v.recoil;
    const lift = v.hover ? 1 + 0.03 * Math.sin(t * 3 + v.radius) : 1;
    v.body.setPosition(bx, by).setAngle(bf.heading).setScale(lift / BOT_RES);
    if (v.flashMs > 0) v.body.setTint(v.flashMs > 100 ? 0xffffff : 0xff9a9a);
    else v.body.clearTint();
    v.base?.setPosition(bf.x, bf.y);
    const so = v.hover ? 14 : 7;
    v.shadow.setPosition(bf.x + so * 0.8, bf.y + so * 1.2);
    if (v.led) {
      const blink = Math.sin(t * 4 + v.radius) > 0 ? 0.9 : 0.45;
      v.led.setVisible(true).setPosition(bx, by).setAlpha(blink);
    }
    if (v.beam) {
      const flicker = 0.92 + 0.08 * Math.sin(t * 23 + v.radius);
      v.beam.setVisible(true).setPosition(bx + dir.x * (v.hh - 2), by + dir.y * (v.hh - 2)).setAngle(bf.heading).setAlpha((v.team === 'player' ? 1 : 0.4) * flicker);
    }
    v.shield.setVisible(bf.shield).setPosition(bx, by).setAlpha(0.75 + 0.2 * Math.sin(t * 6));
    v.shieldRing.setVisible(bf.shield).setPosition(bx, by).setAngle(t * 40);

    this.treads(v, bf, fxDt);
  }

  private treads(v: BotView, bf: BotFrame, fxDt: number): void {
    const drive = v.init.design.drive;
    if (!this.decals || v.turret || !drive || drive === 'pivot') return;
    const last = v.lastMark;
    if (!last) {
      v.lastMark = { x: bf.x, y: bf.y };
      return;
    }
    const d = distance(last, bf);
    if (d < 4) return;
    if (d > 80) {
      v.lastMark = { x: bf.x, y: bf.y };
      return;
    }
    const steps = Math.floor(d / 4);
    const r = this.decalRes;
    const side = headingVector(bf.heading + 90);
    const off = drive === 'tracks' ? v.hw + 5 : v.hw + 4.5;
    for (let i = 1; i <= steps; i++) {
      const x = last.x + ((bf.x - last.x) * i) / steps;
      const y = last.y + ((bf.y - last.y) * i) / steps;
      if (drive === 'hover') {
        if (fxDt > 0 && i === steps && this.rand() < 0.5) this.emitters?.dust.explode(1, x, y);
        continue;
      }
      for (const s of [-1, 1]) {
        this.decals.stamp('fx-tread', undefined, (x + side.x * off * s) * r, (y + side.y * off * s) * r, {
          angle: bf.heading,
          alpha: drive === 'tracks' ? 0.22 : 0.15,
          scaleX: (drive === 'tracks' ? 2 : 1.5) * r,
          scaleY: r,
        });
      }
    }
    v.lastMark = { x: last.x + ((bf.x - last.x) * steps * 4) / d, y: last.y + ((bf.y - last.y) * steps * 4) / d };
  }

  private renderProjectiles(list: ProjectileFrame[]): void {
    const seen = new Set<number>();
    const trails = this.trails!;
    trails.clear();
    for (const p of list) {
      seen.add(p.id);
      let pv = this.projectiles.get(p.id);
      if (!pv) {
        const owner = this.bots.get(p.owner);
        const colour = this.teamColour(owner?.team);
        pv = {
          colour,
          trail: [],
          glow: this.add.image(p.x, p.y, 'fx-glow').setTint(colour).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(26, 26).setDepth(D.projectiles),
          core: this.add.image(p.x, p.y, 'fx-bolt').setTint(owner?.team === 'player' ? 0xffe8ec : 0xfff3d6).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.projectiles).setDisplaySize(22, 8),
        };
        this.projectiles.set(p.id, pv);
      }
      pv.glow.setPosition(p.x, p.y);
      pv.core.setPosition(p.x, p.y).setAngle(p.heading - 90);
      const last = pv.trail[pv.trail.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 2) pv.trail.push({ x: p.x, y: p.y });
      if (pv.trail.length > 8) pv.trail.shift();
      const n = pv.trail.length;
      for (let i = 1; i < n; i++) {
        const a = pv.trail[i - 1]!;
        const b = pv.trail[i]!;
        const f = i / n;
        trails.lineStyle(7 * f, pv.colour, 0.4 * f).lineBetween(a.x, a.y, b.x, b.y);
        trails.lineStyle(2.5 * f, 0xffffff, 0.7 * f).lineBetween(a.x, a.y, b.x, b.y);
      }
    }
    for (const [id, pv] of this.projectiles) {
      if (seen.has(id)) continue;
      pv.glow.destroy();
      pv.core.destroy();
      this.projectiles.delete(id);
    }
  }

  private renderMarkers(t: number): void {
    for (const m of this.markers.values()) {
      const g = m.g;
      g.clear();
      const done = m.state !== 'idle';
      if (m.kind === 'core') {
        const visible = m.state !== 'collected';
        m.ring.setVisible(visible);
        m.glow.setVisible(visible);
        if (!visible) continue;
        const bob = Math.sin(t * 2.2 + m.x) * 2;
        m.ring.setAngle(-t * 25).setAlpha(0.35);
        m.glow.setAlpha(0.25 + 0.1 * Math.sin(t * 3));
        g.setPosition(m.x, m.y + bob).setAngle(Math.sin(t * 0.8) * 8);
        this.hexagon(g, 18, COL.core, 0.2, 2);
        this.hexagon(g, 8, COL.core, 0, 2);
      } else if (m.kind === 'flag') {
        const colour = COL.signal;
        m.ring.setAngle(t * 20).setAlpha(done ? 1 : 0.8);
        m.glow.setAlpha(done ? 0.5 + 0.2 * Math.sin(t * 6) : 0.18 + 0.06 * Math.sin(t * 2));
        g.setPosition(m.x, m.y);
        // Pole and a waving pennant.
        g.lineStyle(2, colour, 1).lineBetween(-8, 18, -8, -18);
        g.fillStyle(colour, 0.3).lineStyle(2, colour, 1);
        g.beginPath();
        g.moveTo(-8, -18);
        for (let i = 1; i <= 4; i++) {
          const x = -8 + i * 5;
          g.lineTo(x, -18 + i * 2 + Math.sin(t * 5 - i) * 1.5);
        }
        g.lineTo(-8, -2);
        g.closePath();
        g.fillPath();
        g.strokePath();
      } else {
        const colour = done ? COL.signal : COL.cyan;
        m.ring.setTint(colour).setAngle(-t * 15);
        m.glow.setTint(colour).setAlpha(done ? 0.3 : 0.15);
        m.label?.setColor(done ? PALETTE.signal : PALETTE.cyan).setText(done ? '✓' : String(m.index));
        g.setPosition(m.x, m.y);
        g.lineStyle(2, colour, 1).strokeCircle(0, 0, 14);
        if (done) g.fillStyle(colour, 0.15).fillCircle(0, 0, 14);
      }
    }
  }

  private hexagon(g: Phaser.GameObjects.Graphics, r: number, colour: number, fill: number, width: number): void {
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      pts.push(new Phaser.Math.Vector2(Math.cos(a) * r, Math.sin(a) * r));
    }
    if (fill) g.fillStyle(colour, fill).fillPoints(pts, true);
    g.lineStyle(width, colour, 1).strokePoints(pts, true);
  }

  /** LOCK brackets on the enemy the player's blaster is pointing at. */
  private renderLock(byId: Map<string, BotFrame>, fxDt: number): void {
    const lock = this.lock;
    if (!lock) return;
    const player = [...this.bots.values()].find((b) => b.team === 'player');
    const pf = player ? byId.get(player.init.id) : undefined;
    let target: { view: BotView; frame: BotFrame; dist: number } | undefined;
    const slots = player?.init.design.slots;
    const blasterSlot = slots ? (slots.front === 'blaster' ? 'front' : slots.rear === 'blaster' ? 'rear' : undefined) : undefined;
    if (player && pf?.alive && blasterSlot) {
      const aim = pf.heading + SLOT_ANGLE[blasterSlot];
      const range = PARTS.blaster.blaster?.range ?? 500;
      for (const v of this.bots.values()) {
        if (v.team !== 'enemy') continue;
        const ef = byId.get(v.init.id);
        if (!ef?.alive) continue;
        const dist = distance(pf, ef);
        const off = Math.abs(normaliseBearing(headingTo(pf, ef) - aim));
        const tolerance = Math.max(4, (Math.atan2(v.radius, dist) * 180) / Math.PI);
        if (dist <= range && off <= tolerance && (!target || dist < target.dist)) target = { view: v, frame: ef, dist };
      }
    }
    if (!target) {
      lock.target = undefined;
      lock.t = 0;
      for (const b of lock.brackets) b.setVisible(false);
      lock.text.setVisible(false);
      return;
    }
    if (lock.target !== target.view.init.id) {
      lock.target = target.view.init.id;
      lock.t = 0;
    }
    lock.t = Math.min(1, lock.t + Math.max(fxDt, 16) / 180);
    const ease = Phaser.Math.Easing.Back.Out(lock.t);
    const s = target.view.radius + 10 + (1 - ease) * 14;
    const { x, y } = target.frame;
    const corners: Array<[number, number]> = [
      [x - s, y - s],
      [x + s, y - s],
      [x + s, y + s],
      [x - s, y + s],
    ];
    lock.brackets.forEach((b, i) => b.setVisible(true).setPosition(corners[i]![0], corners[i]![1]).setAlpha(lock.t));
    lock.text
      .setVisible(true)
      .setPosition(x, y - s - 6)
      .setText(`LOCK ${Math.round(target.dist)}cm`)
      .setAlpha(lock.t);
  }
}
