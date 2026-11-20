/**
 * The static "test hall" floor (docs/visual/Arena.dc.html), painted once per level with the
 * Canvas 2D API: steel plates, painted markings, stencil, start pad, terrain and walls.
 * The scene layers animation (lava glow, water ripples, corner lights) on top.
 */
import type { WorldInit } from '../shared/frames';
import type { Pose, Rect } from '../shared/geometry';
import { TILE_SIZE } from '../shared/geometry';
import type { LevelDef } from '../shared/level';
import { TILE_CHARS } from '../shared/level';
import type { Terrain } from '../shared/parts';
import { PALETTE } from '../shared/palette';

/** Space around the arena for the thick outer wall, cm. */
export const HALL_MARGIN = 24;

export type Ctx = CanvasRenderingContext2D;

/**
 * Run `draw` blurred by `px` device pixels. Safari has no canvas `filter`, so there the shape is
 * drawn off the canvas and only its shadow lands (blur sigma = shadowBlur / 2), coloured `colour`
 * at the shape's own alpha. Assumes no rotation in the current transform.
 */
export function drawBlurred(ctx: Ctx, px: number, colour: string, draw: () => void): void {
  ctx.save();
  if (typeof (ctx as { filter?: unknown }).filter === 'string') {
    ctx.filter = `blur(${px}px)`;
  } else {
    const away = ctx.canvas.width + 4 * px;
    ctx.translate(away / ctx.getTransform().a, 0);
    ctx.shadowOffsetX = -away;
    ctx.shadowBlur = 2 * px;
    ctx.shadowColor = colour;
  }
  draw();
  ctx.restore();
}

export function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TerrainGrid {
  cols: number;
  rows: number;
  at(c: number, r: number): Terrain;
  /** Tile rects of one terrain type. */
  tiles(kind: Terrain): Rect[];
}

export function terrainGrid(level: Pick<LevelDef, 'map'>): TerrainGrid {
  const rows = level.map.length;
  const cols = Math.max(0, ...level.map.map((r) => r.length));
  const at = (c: number, r: number): Terrain => {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return 'wall';
    const ch = level.map[r]![c] ?? '.';
    return (TILE_CHARS as Record<string, Terrain>)[ch] ?? 'floor';
  };
  return {
    cols,
    rows,
    at,
    tiles(kind) {
      const out: Rect[] = [];
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          if (at(c, r) === kind) out.push({ x: c * TILE_SIZE, y: r * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE });
      return out;
    },
  };
}

/**
 * Union of a terrain's tiles as one path, corners rounded where the tile has no neighbour of the
 * same kind on both sides (so pools look organic rather than blocky).
 */
export function terrainPath(grid: TerrainGrid, kind: Terrain, radius: number): Path2D {
  const p = new Path2D();
  const T = TILE_SIZE;
  for (let r = 0; r < grid.rows; r++)
    for (let c = 0; c < grid.cols; c++) {
      if (grid.at(c, r) !== kind) continue;
      const same = (dc: number, dr: number) => grid.at(c + dc, r + dr) === kind;
      const rad = (dc: number, dr: number) => (!same(dc, 0) && !same(0, dr) ? radius : 0);
      p.roundRect(c * T, r * T, T, T, [rad(-1, -1), rad(1, -1), rad(1, 1), rad(-1, 1)]);
    }
  return p;
}

function inArenaInterior(r: Rect, w: number, h: number): boolean {
  // Full-length strips along an edge are the automatic outer wall: the frame draws those.
  const horizontal = r.w >= w - 1 && r.h <= TILE_SIZE && (r.y <= 0 || r.y + r.h >= h);
  const vertical = r.h >= h - 1 && r.w <= TILE_SIZE && (r.x <= 0 || r.x + r.w >= w);
  const outside = r.x + r.w <= 0 || r.y + r.h <= 0 || r.x >= w || r.y >= h;
  return !horizontal && !vertical && !outside;
}

/** Walls drawn as concrete blocks (interior ones). Edge strips are part of the outer frame. */
export function interiorWalls(world: Pick<WorldInit, 'walls' | 'width' | 'height'>): Rect[] {
  return world.walls.filter((r) => inArenaInterior(r, world.width, world.height));
}

function hazardPattern(ctx: Ctx, stripe: number): CanvasPattern | null {
  const tile = document.createElement('canvas');
  const s = Math.ceil(stripe * 2);
  tile.width = tile.height = s;
  const t = tile.getContext('2d')!;
  t.fillStyle = '#16130C';
  t.fillRect(0, 0, s, s);
  t.fillStyle = PALETTE.hazardStripe;
  t.beginPath();
  // Two diagonal bands make a seamless 45 degree stripe.
  t.moveTo(0, 0);
  t.lineTo(s / 2, 0);
  t.lineTo(0, s / 2);
  t.closePath();
  t.moveTo(s, 0);
  t.lineTo(s, s / 2);
  t.lineTo(s / 2, s);
  t.lineTo(0, s);
  t.closePath();
  t.fill();
  return ctx.createPattern(tile, 'repeat');
}

function drawPlates(ctx: Ctx, w: number, h: number, rand: () => number): void {
  const P = 80;
  ctx.fillStyle = PALETTE.plateDark;
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += P)
    for (let x = 0; x < w; x += P) {
      const g = ctx.createLinearGradient(x, y, x + P, y + P);
      const v = (rand() - 0.5) * 0.08;
      g.addColorStop(0, shade(PALETTE.plateA, v));
      g.addColorStop(1, shade(PALETTE.plateB, v));
      ctx.fillStyle = g;
      ctx.fillRect(x + 1, y + 1, P - 2, P - 2);
      ctx.strokeStyle = '#26313D';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 1, y + 1.5);
      ctx.lineTo(x + P - 1, y + 1.5);
      ctx.stroke();
      ctx.strokeStyle = '#232D38';
      ctx.beginPath();
      ctx.moveTo(x + 1.5, y + 1);
      ctx.lineTo(x + 1.5, y + P - 1);
      ctx.stroke();
      ctx.fillStyle = '#2E3A47';
      for (const [rx, ry] of [
        [7, 7],
        [P - 7, 7],
        [7, P - 7],
        [P - 7, P - 7],
      ] as const) {
        ctx.beginPath();
        ctx.arc(x + rx, y + ry, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3A4756';
        ctx.beginPath();
        ctx.arc(x + rx - 0.5, y + ry - 0.5, 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2E3A47';
      }
      ctx.strokeStyle = '#151C24';
      ctx.lineWidth = 2;
      ctx.setLineDash([1, 5]);
      ctx.beginPath();
      if (rand() < 0.5) {
        ctx.moveTo(x + 16, y + P / 2);
        ctx.lineTo(x + P - 16, y + P / 2);
      } else {
        ctx.moveTo(x + P / 2, y + 16);
        ctx.lineTo(x + P / 2, y + P - 16);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
}

/** Lighten (v > 0) or darken a hex colour. */
export function shade(hex: string, v: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * (1 + v))));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function drawMarkings(ctx: Ctx, w: number, h: number, label: string | undefined, spawn: Pose, rand: () => number): void {
  // Dashed hazard perimeter.
  ctx.strokeStyle = 'rgba(224,162,62,0.22)';
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 10]);
  const inset = Math.min(48, Math.min(w, h) * 0.06);
  ctx.strokeRect(inset, inset, w - 2 * inset, h - 2 * inset);
  ctx.setLineDash([]);

  // Centre ring and the giant zone stencil.
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.16;
  ctx.strokeStyle = 'rgba(63,208,224,0.12)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(63,208,224,0.07)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 8]);
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.87, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  if (label) {
    const size = Math.min(132, w / Math.max(3, label.length) * 1.4);
    ctx.font = `700 ${size}px 'Space Grotesk', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(230,237,243,0.035)';
    ctx.fillText(label, cx, cy + size * 0.05);
  }

  // Scuffs, seams and painted direction arrows.
  ctx.strokeStyle = 'rgba(42,53,66,0.8)';
  ctx.lineWidth = 1;
  for (let i = 0; i < Math.round((w * h) / 120000) + 3; i++) {
    const x = rand() * w;
    const y = rand() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 120, y + (rand() - 0.5) * 80);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(224,162,62,0.35)';
  for (let i = 0; i < 2; i++) {
    const x = inset + 40 + rand() * (w - 2 * inset - 80);
    const y = h - inset - 10 - rand() * 60;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 12, y + 22);
    ctx.lineTo(x + 12, y + 22);
    ctx.closePath();
    ctx.fill();
  }

  // START hex pad under the spawn.
  ctx.save();
  ctx.translate(spawn.x, spawn.y);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 30, Math.sin(a) * 30);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(63,208,224,0.05)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(63,208,224,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = "10px 'JetBrains Mono', monospace";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(63,208,224,0.5)';
  const below = spawn.y + 46 < h - 4;
  ctx.fillText('S T A R T', 0, below ? 44 : -36);
  ctx.restore();
}

function drawTerrain(ctx: Ctx, grid: TerrainGrid, rand: () => number, scale: number): void {
  // Rough ground: olive with pebble dots.
  const rough = terrainPath(grid, 'rough', 10);
  ctx.strokeStyle = PALETTE.roughDot;
  ctx.lineWidth = 2;
  ctx.stroke(rough);
  ctx.fillStyle = PALETTE.rough;
  ctx.fill(rough);
  ctx.save();
  ctx.clip(rough);
  for (const t of grid.tiles('rough')) {
    for (let y = 5; y < TILE_SIZE; y += 10)
      for (let x = 5; x < TILE_SIZE; x += 10) {
        ctx.fillStyle = PALETTE.roughDot;
        ctx.beginPath();
        ctx.arc(t.x + x + (rand() - 0.5) * 3, t.y + y + (rand() - 0.5) * 3, 1.4 + rand() * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
  }
  ctx.restore();

  // Water: deep blue; ripples are animated by the scene.
  const water = terrainPath(grid, 'water', 8);
  ctx.strokeStyle = PALETTE.waterEdge;
  ctx.lineWidth = 3;
  ctx.stroke(water);
  ctx.fillStyle = PALETTE.water;
  ctx.fill(water);

  // Pits: black void with a dashed lip.
  const pit = terrainPath(grid, 'pit', 4);
  ctx.strokeStyle = '#5B6B7C';
  ctx.lineWidth = 4;
  ctx.setLineDash([6, 4]);
  ctx.stroke(pit);
  ctx.setLineDash([]);
  ctx.fillStyle = '#000';
  ctx.fill(pit);

  // Lava: crust rim, molten orange with hot yellow upwellings, darker cooling edges and crust.
  const lava = terrainPath(grid, 'lava', 16);
  const tiles = grid.tiles('lava');
  if (tiles.length) {
    ctx.strokeStyle = '#3A1408';
    ctx.lineWidth = 8;
    ctx.stroke(lava);
    const T = TILE_SIZE;
    ctx.save();
    ctx.clip(lava);
    ctx.fillStyle = PALETTE.lavaMid;
    ctx.fill(lava);
    // Hot spots away from the edges, at irregular places so the pool doesn't look tiled.
    for (const t of tiles) {
      if (rand() < 0.45) continue;
      const cx = t.x + T * (0.2 + rand() * 0.6);
      const cy = t.y + T * (0.2 + rand() * 0.6);
      const r = T * (0.5 + rand() * 0.6);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(255,241,194,0.95)');
      g.addColorStop(0.35, 'rgba(255,226,154,0.7)');
      g.addColorStop(1, 'rgba(255,138,61,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    }
    // Cooler, darker lava along the shore: blur the surrounding non-lava tiles in over the edge.
    // (Stroking the path would also mark the seams between tiles.)
    const shore = new Path2D();
    for (let r = -1; r <= grid.rows; r++)
      for (let c = -1; c <= grid.cols; c++)
        if (grid.at(c, r) !== 'lava') shore.rect(c * T, r * T, T, T);
    ctx.filter = `blur(${8 * scale}px)`;
    ctx.fillStyle = PALETTE.lavaLow;
    ctx.fill(shore);
    ctx.filter = `blur(${3 * scale}px)`;
    ctx.fillStyle = PALETTE.lavaEdge;
    ctx.fill(shore);
    ctx.filter = 'none';
    // Crust: wandering dark lines at random angles.
    for (const t of tiles) {
      if (rand() < 0.4) continue;
      const a = rand() * Math.PI;
      const len = T * (0.8 + rand() * 0.9);
      const cx = t.x + T * rand();
      const cy = t.y + T * rand();
      const dx = (Math.cos(a) * len) / 2;
      const dy = (Math.sin(a) * len) / 2;
      const bend = (rand() - 0.5) * T * 0.6;
      ctx.beginPath();
      ctx.moveTo(cx - dx, cy - dy);
      ctx.quadraticCurveTo(cx - bend * Math.sin(a), cy + bend * Math.cos(a), cx + dx, cy + dy);
      ctx.strokeStyle = 'rgba(122,30,8,0.6)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(58,20,8,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawWall(ctx: Ctx, r: Rect, stripes: CanvasPattern | null): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowOffsetX = 7;
  ctx.shadowOffsetY = 10;
  ctx.shadowBlur = 10;
  const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
  g.addColorStop(0, PALETTE.wallLight);
  g.addColorStop(1, PALETTE.wallDark);
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();

  const horizontal = r.w >= r.h;
  const band = Math.min(18, (horizontal ? r.w : r.h) / 4);
  if (stripes) {
    ctx.fillStyle = stripes;
    if (horizontal) {
      ctx.fillRect(r.x, r.y, band, r.h);
      ctx.fillRect(r.x + r.w - band, r.y, band, r.h);
    } else {
      ctx.fillRect(r.x, r.y, r.w, band);
      ctx.fillRect(r.x, r.y + r.h - band, r.w, band);
    }
  }
  // Expansion joints.
  ctx.strokeStyle = '#1B222B';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const len = horizontal ? r.w : r.h;
  const n = Math.floor((len - 2 * band) / 55);
  for (let i = 1; i <= n; i++) {
    const t = band + ((len - 2 * band) * i) / (n + 1);
    if (horizontal) {
      ctx.moveTo(r.x + t, r.y + 6);
      ctx.lineTo(r.x + t, r.y + r.h - 6);
    } else {
      ctx.moveTo(r.x + 6, r.y + t);
      ctx.lineTo(r.x + r.w - 6, r.y + t);
    }
  }
  ctx.stroke();
  ctx.strokeStyle = PALETTE.wallEdge;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(r.x + 0.75, r.y + 0.75, r.w - 1.5, r.h - 1.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(r.x + 2, r.y + 2.5);
  ctx.lineTo(r.x + r.w - 2, r.y + 2.5);
  ctx.stroke();
}

function drawFrame(ctx: Ctx, w: number, h: number, edgeStrips: Rect[]): void {
  const M = HALL_MARGIN;
  ctx.fillStyle = '#1E2731';
  for (const r of edgeStrips) ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillRect(-M, -M, w + 2 * M, M);
  ctx.fillRect(-M, h, w + 2 * M, M);
  ctx.fillRect(-M, 0, M, h);
  ctx.fillRect(w, 0, M, h);
  ctx.strokeStyle = '#151C24';
  ctx.lineWidth = 1;
  ctx.strokeRect(-M + 0.5, -M + 0.5, w + 2 * M - 1, h + 2 * M - 1);
  // Bolts along the frame.
  ctx.fillStyle = '#2C3846';
  const step = 60;
  for (let x = 30; x < w; x += step) {
    for (const y of [-M / 2, h + M / 2]) {
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (let y = 30; y < h; y += step) {
    for (const x of [-M / 2, w + M / 2]) {
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.strokeStyle = '#4B5A6A';
  ctx.lineWidth = 2;
  ctx.strokeRect(-1, -1, w + 2, h + 2);
}

export interface HallInput {
  level: Pick<LevelDef, 'map' | 'label'>;
  world: Pick<WorldInit, 'walls' | 'width' | 'height' | 'seed'>;
  spawn: Pose;
}

/** Paint the whole hall (arena plus HALL_MARGIN of frame) into ctx at `scale` px per cm. */
export function paintHall(ctx: Ctx, input: HallInput, scale: number): void {
  const { width: w, height: h } = input.world;
  const rand = rng(input.world.seed * 7919 + w);
  const grid = terrainGrid(input.level);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(HALL_MARGIN, HALL_MARGIN);
  ctx.fillStyle = PALETTE.hallFloor;
  ctx.fillRect(-HALL_MARGIN, -HALL_MARGIN, w + 2 * HALL_MARGIN, h + 2 * HALL_MARGIN);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  drawPlates(ctx, w, h, rand);
  const spot = ctx.createRadialGradient(w * 0.4, h * 0.5, 0, w * 0.4, h * 0.5, Math.max(w, h) * 0.5);
  spot.addColorStop(0, 'rgba(159,216,255,0.07)');
  spot.addColorStop(1, 'rgba(159,216,255,0)');
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, w, h);
  drawMarkings(ctx, w, h, input.level.label, input.spawn, rand);
  drawTerrain(ctx, grid, rand, scale);
  const stripes = hazardPattern(ctx, 7);
  for (const r of interiorWalls(input.world)) drawWall(ctx, r, stripes);
  ctx.restore();

  drawFrame(
    ctx,
    w,
    h,
    input.world.walls.filter((r) => !inArenaInterior(r, w, h)),
  );
  ctx.restore();
}

/** Blurred orange glow of all lava, for the scene's pulsing additive layer. */
export function paintLavaGlow(ctx: Ctx, input: HallInput, scale: number): void {
  const grid = terrainGrid(input.level);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(HALL_MARGIN, HALL_MARGIN);
  ctx.fillStyle = 'rgba(255,106,42,0.75)';
  drawBlurred(ctx, 12 * scale, 'rgb(255,106,42)', () => ctx.fill(terrainPath(grid, 'lava', 16)));
  ctx.restore();
}
