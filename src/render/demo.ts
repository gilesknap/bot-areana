/**
 * Dev-only renderer demo: a tiny scripted fake sim produces a frame stream so the arena can be
 * looked at (and screenshotted) without Pyodide or the real sim.
 * Open http://localhost:5173/src/render/demo.html  (?t=<tick> pre-seeks, ?speed=2).
 */
import { setMuted, sfx, sfxForEvent, unlockAudioOnGesture } from '../audio';
import { CHASSIS } from '../parts/catalogue';
import type { BotFrame, Frame, ProjectileFrame, SimEvent, WorldInit } from '../shared/frames';
import { distance, headingTo, headingVector, normaliseBearing, TICK_RATE, type Rect } from '../shared/geometry';
import type { LevelDef } from '../shared/level';
import type { BotDesign } from '../shared/parts';
import type { PlaybackSpeed } from '../shared/save';
import { ArenaView } from './ArenaView';
import { botSvg, markerSvg, partGlyphSvg, tileSvg } from './glyphs';
import { ArenaHud } from './hud';

const MAP = [
  '......................',
  '......................',
  '..................PP..',
  '..................PP..',
  '......................',
  '......................',
  '......................',
  '......................',
  '.RRRR.................',
  '.RRRR.................',
  '.RRRR.................',
  '......................',
  '......................',
  '..........LLLL........',
  '.........LLLLLL.......',
  '.........LLLLL........',
  '.....WWW...LL.........',
  '.....WWW..............',
  '......................',
];

const PLAYER: BotDesign = { chassis: 'chassis_m', drive: 'wheels', slots: { front: 'blaster', left: 'rangefinder', right: 'radar', centre: 'battery' } };
const TURRET: BotDesign = { chassis: 'turret_base', drive: 'pivot', slots: { front: 'blaster' } };
const BRUTE: BotDesign = { chassis: 'chassis_m', drive: 'tracks', slots: { front: 'ram', left: 'armour', right: 'armour', rear: 'shield' } };

const WALLS: Rect[] = [
  { x: 290, y: 100, w: 34, h: 200 },
  { x: 560, y: 330, w: 220, h: 34 },
];

export const DEMO_LEVEL = {
  id: 'demo',
  number: 5,
  title: 'Target Practice',
  concept: 'while',
  brief: '',
  lesson: { title: '', snippet: '', blurb: '' },
  map: MAP,
  walls: WALLS,
  spawn: { x: 92, y: 680, heading: 0 },
  objectives: [
    { type: 'destroy', id: 'o1', label: 'Destroy the turrets' },
    { type: 'collect', id: 'o2', label: 'Collect cores', items: [], radius: 30 },
  ],
  enemies: [],
  budget: { weight: 60, power: 20 },
  unlocks: [],
  stars: [
    { type: 'time', seconds: 60, label: '' },
    { type: 'damage', max: 20, label: '' },
  ],
  seed: 5,
  starter: '',
  hints: [],
  label: 'B-07',
  solution: { design: PLAYER, script: '' },
} satisfies LevelDef;

const ENEMIES = [
  { id: 'turret1', design: TURRET, start: { x: 720, y: 140, heading: 240 } },
  { id: 'turret2', design: TURRET, start: { x: 740, y: 520, heading: 278 } },
  { id: 'turret3', design: TURRET, start: { x: 380, y: 260, heading: 225 } },
  { id: 'brute', design: BRUTE, start: { x: 640, y: 660, heading: 270 } },
];

export const DEMO_WORLD: WorldInit = {
  walls: WALLS,
  width: 880,
  height: 760,
  seed: 5,
  bots: [
    { id: 'player', team: 'player', design: PLAYER, start: DEMO_LEVEL.spawn, maxHp: 100, maxEnergy: 70 },
    ...ENEMIES.map((e) => ({ id: e.id, team: 'enemy' as const, design: e.design, start: e.start, maxHp: e.design === TURRET ? 40 : 100, maxEnergy: 100 })),
  ],
  markers: [
    { id: 'core1', kind: 'core', x: 140, y: 120 },
    { id: 'core2', kind: 'core', x: 820, y: 420 },
    { id: 'wp1', kind: 'waypoint', x: 200, y: 440, index: 1 },
    { id: 'flag', kind: 'flag', x: 460, y: 80 },
  ],
};

// ---- A deliberately tiny fake sim ------------------------------------------------------------

type Action =
  | { do: 'move'; x: number; y: number }
  | { do: 'face'; target: string }
  | { do: 'fire' }
  | { do: 'scan' }
  | { do: 'range' }
  | { do: 'shield'; on: boolean }
  | { do: 'wait'; ticks: number };

const SCRIPT: Action[] = [
  { do: 'range' },
  { do: 'move', x: 200, y: 440 },
  { do: 'scan' },
  { do: 'face', target: 'turret3' },
  { do: 'fire' },
  { do: 'wait', ticks: 20 },
  { do: 'fire' },
  { do: 'wait', ticks: 25 },
  { do: 'shield', on: true },
  { do: 'move', x: 140, y: 120 },
  { do: 'shield', on: false },
  { do: 'face', target: 'turret1' },
  { do: 'range' },
  { do: 'move', x: 460, y: 80 },
  { do: 'face', target: 'turret1' },
  { do: 'fire' },
  { do: 'wait', ticks: 20 },
  { do: 'fire' },
  { do: 'wait', ticks: 20 },
  { do: 'scan' },
  { do: 'move', x: 520, y: 450 },
  { do: 'face', target: 'turret2' },
  { do: 'fire' },
  { do: 'wait', ticks: 20 },
  { do: 'fire' },
  { do: 'wait', ticks: 20 },
  { do: 'face', target: 'brute' },
  { do: 'fire' },
  { do: 'wait', ticks: 20 },
  { do: 'fire' },
  { do: 'wait', ticks: 20 },
  { do: 'fire' },
  { do: 'wait', ticks: 20 },
  { do: 'fire' },
  { do: 'wait', ticks: 20 },
  { do: 'fire' },
  { do: 'wait', ticks: 30 },
  { do: 'move', x: 820, y: 420 },
  { do: 'wait', ticks: 45 },
];

function fakeRun(world: WorldInit): Frame[] {
  const bots = new Map<string, BotFrame>(
    world.bots.map((b) => [b.id, { id: b.id, x: b.start.x, y: b.start.y, heading: b.start.heading, hp: b.maxHp, energy: b.maxEnergy, shield: false, alive: true, moving: false }]),
  );
  const player = bots.get('player')!;
  const shots: Array<ProjectileFrame & { range: number }> = [];
  const cooldown = new Map<string, number>();
  const frames: Frame[] = [];
  let nextShot = 1;
  let pc = 0;
  let waitLeft = -1;
  let destroyed = 0;
  const collected = new Set<string>();
  let route = 0;
  const brutePath = [
    { x: 640, y: 660 },
    { x: 820, y: 660 },
    { x: 820, y: 560 },
    { x: 640, y: 560 },
  ];

  const fire = (b: BotFrame, events: SimEvent[]) => {
    const v = headingVector(b.heading);
    const r = CHASSIS[world.bots.find((x) => x.id === b.id)!.design.chassis].radius + 14;
    const x = b.x + v.x * r;
    const y = b.y + v.y * r;
    events.push({ type: 'muzzle_flash', botId: b.id, slot: 'front', x, y, heading: b.heading });
    shots.push({ id: nextShot++, x, y, heading: b.heading, owner: b.id, range: 520 });
  };

  for (let tick = 0; tick < 60 * TICK_RATE; tick++) {
    const events: SimEvent[] = [];
    if (tick === 0) {
      events.push({ type: 'objective', objectiveId: 'o1', progress: 0, total: 4, done: false });
      events.push({ type: 'objective', objectiveId: 'o2', progress: 0, total: 2, done: false });
      events.push({ type: 'print', text: 'demo start', stream: 'stdout' });
    }
    player.moving = false;
    // Player script.
    const a = SCRIPT[pc];
    if (a && player.alive) {
      let done = false;
      switch (a.do) {
        case 'move': {
          const d = distance(player, a);
          const want = headingTo(player, a);
          const turn = normaliseBearing(want - player.heading);
          if (Math.abs(turn) > 2) player.heading = (player.heading + Math.sign(turn) * Math.min(Math.abs(turn), 6) + 360) % 360;
          else if (d > 2) {
            const step = Math.min(d, 120 / TICK_RATE);
            const v = headingVector(player.heading);
            player.x += v.x * step;
            player.y += v.y * step;
          } else done = true;
          player.moving = !done;
          if (MAP[Math.floor(player.y / 40)]?.[Math.floor(player.x / 40)] === 'R' && tick % 6 === 0)
            events.push({ type: 'hazard', botId: 'player', terrain: 'rough', at: { x: player.x, y: player.y } });
          break;
        }
        case 'face': {
          const t = bots.get(a.target)!;
          const turn = normaliseBearing(headingTo(player, t) - player.heading);
          player.heading = (player.heading + Math.sign(turn) * Math.min(Math.abs(turn), 6) + 360) % 360;
          player.moving = Math.abs(turn) > 0.5;
          done = Math.abs(turn) <= 0.5;
          break;
        }
        case 'fire':
          fire(player, events);
          player.energy -= 5;
          done = true;
          break;
        case 'scan':
          events.push({ type: 'scan', botId: 'player', range: 500 });
          done = true;
          break;
        case 'range':
          events.push({ type: 'range', botId: 'player', slot: 'left', distance: 120 + (tick % 200) });
          done = true;
          break;
        case 'shield':
          player.shield = a.on;
          events.push({ type: 'shield', botId: 'player', on: a.on });
          done = true;
          break;
        case 'wait':
          if (waitLeft < 0) waitLeft = a.ticks;
          done = --waitLeft <= 0;
          if (done) waitLeft = -1;
          break;
      }
      if (done) pc++;
    }
    player.energy = Math.min(70, player.energy + 2 / TICK_RATE);

    // Enemies: turrets track and shoot, the brute patrols.
    for (const e of ENEMIES) {
      const b = bots.get(e.id)!;
      b.moving = false;
      if (!b.alive) continue;
      if (e.design === TURRET) {
        const turn = normaliseBearing(headingTo(b, player) - b.heading);
        b.heading = (b.heading + Math.sign(turn) * Math.min(Math.abs(turn), 3) + 360) % 360;
        const cd = (cooldown.get(e.id) ?? 40 + ENEMIES.indexOf(e) * 20) - 1;
        cooldown.set(e.id, cd);
        if (cd <= 0 && Math.abs(turn) < 6 && distance(b, player) < 480 && player.alive) {
          fire(b, events);
          cooldown.set(e.id, 75);
        }
      } else {
        const target = brutePath[route % brutePath.length]!;
        const turn = normaliseBearing(headingTo(b, target) - b.heading);
        if (Math.abs(turn) > 2) b.heading = (b.heading + Math.sign(turn) * Math.min(Math.abs(turn), 4) + 360) % 360;
        else if (distance(b, target) > 2) {
          const v = headingVector(b.heading);
          const step = Math.min(distance(b, target), 70 / TICK_RATE);
          b.x += v.x * step;
          b.y += v.y * step;
        } else route++;
        b.moving = true;
      }
    }

    // Bolts.
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i]!;
      const v = headingVector(s.heading);
      const step = 420 / TICK_RATE;
      s.x += v.x * step;
      s.y += v.y * step;
      s.range -= step;
      const wall = WALLS.find((w) => s.x > w.x && s.x < w.x + w.w && s.y > w.y && s.y < w.y + w.h);
      const target = [...bots.values()].find((b) => b.alive && b.id !== s.owner && distance(b, s) < CHASSIS[world.bots.find((x) => x.id === b.id)!.design.chassis].radius);
      if (target) {
        const shielded = target.shield;
        const damage = shielded ? 2 : target.id === 'player' ? 8 : 20;
        target.hp = Math.max(0, target.hp - damage);
        events.push({ type: 'hit', targetId: target.id, x: s.x, y: s.y, damage, shielded });
        if (target.hp <= 0) {
          target.alive = false;
          events.push({ type: 'explosion', x: target.x, y: target.y, size: target.id === 'brute' ? 'large' : 'small' });
          events.push({ type: 'destroyed', botId: target.id, x: target.x, y: target.y, cause: 'damage' });
          destroyed++;
          events.push({ type: 'objective', objectiveId: 'o1', progress: destroyed, total: 4, done: destroyed === 4 });
          events.push({ type: 'print', text: `${target.id} destroyed`, stream: 'stdout' });
        }
        shots.splice(i, 1);
      } else if (wall || s.range <= 0 || s.x < 0 || s.y < 0 || s.x > world.width || s.y > world.height) {
        if (wall) events.push({ type: 'hit', targetId: 'wall', x: s.x, y: s.y, damage: 0 });
        shots.splice(i, 1);
      }
    }

    for (const m of world.markers) {
      if (m.kind !== 'core' || collected.has(m.id) || distance(player, m) > 30) continue;
      collected.add(m.id);
      events.push({ type: 'marker', markerId: m.id, state: 'collected' });
      events.push({ type: 'objective', objectiveId: 'o2', progress: collected.size, total: 2, done: collected.size === 2 });
    }
    if (tick % 300 === 150) events.push({ type: 'low_energy', botId: 'player' });

    frames.push({ tick, bots: [...bots.values()].map((b) => ({ ...b })), projectiles: shots.map(({ range: _r, ...p }) => ({ ...p })), events });
    if (pc >= SCRIPT.length) break;
  }
  return frames;
}

// ---- Page wiring -----------------------------------------------------------------------------

function start(): void {
  const params = new URLSearchParams(location.search);
  const stage = document.getElementById('stage')!;
  const view = new ArenaView(stage);
  const hud = new ArenaHud(stage);
  const status = document.getElementById('status')!;
  const frames = fakeRun(DEMO_WORLD);
  setMuted(params.has('mute'));
  unlockAudioOnGesture();

  view.onTick((tick, frame) => {
    hud.tick(tick, frame);
    status.textContent = `TICK ${tick} / ${frames.length - 1}`;
  });
  view.onEvent((e) => {
    hud.event(e);
    const s = sfxForEvent(e);
    if (s) sfx(s);
  });
  view.onEnd(() => sfx('victory'));

  hud.load(DEMO_LEVEL, DEMO_WORLD);
  void view.load(DEMO_LEVEL, DEMO_WORLD).then(() => {
    // Stream frames in chunks like the worker does.
    let i = 0;
    const feed = () => {
      view.push(frames.slice(i, i + 60));
      i += 60;
      if (i < frames.length) setTimeout(feed, 50);
      else view.finish();
    };
    feed();
    view.setSpeed((Number(params.get('speed')) || 1) as PlaybackSpeed);
    const seek = Number(params.get('t'));
    if (seek > 0) {
      // Fast-forward for screenshots: play at 4x until the tick is reached, then pause.
      view.setSpeed(4);
      view.play();
      const off = view.onTick((t) => {
        if (t >= seek) {
          view.pause();
          off();
        }
      });
    } else if (!params.has('paused')) view.play();
  });

  const bind = (id: string, fn: () => void) => document.getElementById(id)?.addEventListener('click', () => {
    sfx('click');
    fn();
  });
  bind('play', () => (view.playing ? view.pause() : view.play()));
  bind('step', () => view.step());
  bind('rewind', () => view.rewind());
  for (const s of [0.5, 1, 2, 4] as const) bind(`speed-${s}`, () => view.setSpeed(s));

  const glyphs = document.getElementById('glyphs');
  if (glyphs) {
    const ids = ['chassis_m', 'wheels', 'tracks', 'hover', 'rangefinder', 'radar', 'gps', 'bump', 'blaster', 'ram', 'mine_dropper', 'armour', 'shield', 'battery', 'battery_plus', 'turret_base'] as const;
    glyphs.innerHTML =
      ids.map((id) => `<figure>${partGlyphSvg(id, 56)}<figcaption>${id}</figcaption></figure>`).join('') +
      `<figure>${botSvg(PLAYER, { team: 'player', size: 96 })}<figcaption>player</figcaption></figure>` +
      `<figure>${botSvg(BRUTE, { team: 'enemy', size: 96 })}<figcaption>brute</figcaption></figure>` +
      `<figure>${botSvg({ chassis: 'chassis_l', drive: 'hover', slots: { front: 'radar', left: 'shield', centre: 'battery_plus', rear: 'gps', right: 'bump' } }, { team: 'player', size: 96 })}<figcaption>hover L</figcaption></figure>` +
      `<figure>${botSvg(TURRET, { team: 'enemy', size: 96 })}<figcaption>turret</figcaption></figure>` +
      (['flag', 'waypoint', 'core'] as const).map((k) => `<figure>${markerSvg(k, 56, 2)}<figcaption>${k}</figcaption></figure>`).join('') +
      (['wall', 'lava', 'water', 'pit', 'rough'] as const).map((k) => `<figure>${tileSvg(k, 56)}<figcaption>${k}</figcaption></figure>`).join('');
  }
  Object.assign(window, { demoView: view });
}

start();
