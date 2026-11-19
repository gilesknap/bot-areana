/**
 * The static arena built from a LevelDef: terrain grid, solid walls (with randomWalls resolved
 * from the seed), floor markers, and a coarse nav grid for enemy path-finding.
 */
import type { Rect, Vec2 } from '../shared/geometry';
import { TILE_SIZE } from '../shared/geometry';
import type { LevelDef, TileChar } from '../shared/level';
import { TILE_CHARS } from '../shared/level';
import type { Terrain } from '../shared/parts';
import type { WorldInit } from '../shared/frames';
import { inflate } from './geom';
import { pickIndices, type Rng } from './rng';

export type Marker = WorldInit['markers'][number];

/** Thickness of the invisible boundary walls around the arena. */
const BORDER = 200;

export class Arena {
  readonly cols: number;
  readonly rows: number;
  readonly width: number;
  readonly height: number;
  /** Terrain per tile, row-major. '#' tiles are 'wall'. */
  private readonly terrain: Terrain[];
  /** Visible walls: merged '#' tiles + LevelDef.walls + the chosen randomWalls. */
  readonly walls: Rect[];
  /** walls + the boundary just outside the arena. Used for collisions and rays. */
  readonly solids: Rect[];
  /** Water tiles merged into rects (solid for ground drives). */
  readonly water: Rect[];
  /** solids + water: what blocks wheels and tracks. */
  readonly groundSolids: Rect[];
  /** Pit and lava tiles merged into rects (enemy ground drives steer round them). */
  readonly hazards: Rect[];
  readonly markers: Marker[];
  private readonly navCache = new Map<boolean, boolean[]>();

  constructor(level: LevelDef, rng: Rng) {
    this.rows = level.map.length;
    this.cols = Math.max(0, ...level.map.map((r) => r.length));
    this.width = this.cols * TILE_SIZE;
    this.height = this.rows * TILE_SIZE;
    this.terrain = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const ch = (level.map[r]![c] ?? '.') as TileChar;
        this.terrain.push(TILE_CHARS[ch] ?? 'floor');
      }
    }

    const randomWalls: Rect[] = [];
    if (level.randomWalls) {
      const { options, count } = level.randomWalls;
      for (const i of pickIndices(rng, options.length, count)) randomWalls.push(...options[i]!);
    }
    this.walls = [...this.mergeTiles('wall'), ...(level.walls ?? []), ...randomWalls];
    this.water = this.mergeTiles('water');
    this.hazards = [...this.mergeTiles('pit'), ...this.mergeTiles('lava')];
    const { width: w, height: h } = this;
    this.solids = [
      ...this.walls,
      { x: -BORDER, y: -BORDER, w: w + 2 * BORDER, h: BORDER },
      { x: -BORDER, y: h, w: w + 2 * BORDER, h: BORDER },
      { x: -BORDER, y: 0, w: BORDER, h },
      { x: w, y: 0, w: BORDER, h },
    ];
    this.groundSolids = [...this.solids, ...this.water];
    this.markers = markersFor(level);
  }

  tileAt(x: number, y: number): Terrain {
    const c = Math.floor(x / TILE_SIZE);
    const r = Math.floor(y / TILE_SIZE);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return 'wall';
    return this.terrain[r * this.cols + c]!;
  }

  /** Merge tiles of one terrain into rects: runs per row, then identical runs stacked down. */
  private mergeTiles(kind: Terrain): Rect[] {
    const open: Rect[] = [];
    const done: Rect[] = [];
    for (let r = 0; r < this.rows; r++) {
      const runs: Rect[] = [];
      let start = -1;
      for (let c = 0; c <= this.cols; c++) {
        const hit = c < this.cols && this.terrain[r * this.cols + c] === kind;
        if (hit && start < 0) start = c;
        if (!hit && start >= 0) {
          runs.push({ x: start * TILE_SIZE, y: r * TILE_SIZE, w: (c - start) * TILE_SIZE, h: TILE_SIZE });
          start = -1;
        }
      }
      for (const rect of open.splice(0)) {
        const below = runs.findIndex((run) => run.x === rect.x && run.w === rect.w);
        if (below >= 0) {
          runs.splice(below, 1);
          rect.h += TILE_SIZE;
          open.push(rect);
        } else done.push(rect);
      }
      open.push(...runs);
    }
    return [...done, ...open].sort((a, b) => a.y - b.y || a.x - b.x);
  }

  /** Blocked tiles for path-finding (walls, plus water/pits/lava for ground drives). */
  private nav(hover: boolean): boolean[] {
    let grid = this.navCache.get(hover);
    if (grid) return grid;
    grid = this.terrain.map((t) => t === 'wall' || (!hover && (t === 'water' || t === 'pit' || t === 'lava')));
    for (const wall of this.walls) {
      const shrunk = inflate(wall, -1);
      for (let r = Math.floor(shrunk.y / TILE_SIZE); r <= Math.floor((shrunk.y + shrunk.h) / TILE_SIZE); r++) {
        for (let c = Math.floor(shrunk.x / TILE_SIZE); c <= Math.floor((shrunk.x + shrunk.w) / TILE_SIZE); c++) {
          if (r >= 0 && c >= 0 && r < this.rows && c < this.cols) grid[r * this.cols + c] = true;
        }
      }
    }
    this.navCache.set(hover, grid);
    return grid;
  }

  /**
   * Shortest tile path (8-way, no corner cutting) as tile centres, excluding the start tile.
   * Empty if there is no path or start and goal share a tile.
   */
  findPath(from: Vec2, to: Vec2, hover: boolean): Vec2[] {
    const grid = this.nav(hover);
    const { cols, rows } = this;
    const idx = (p: Vec2) => {
      const c = Math.min(cols - 1, Math.max(0, Math.floor(p.x / TILE_SIZE)));
      const r = Math.min(rows - 1, Math.max(0, Math.floor(p.y / TILE_SIZE)));
      return r * cols + c;
    };
    const start = idx(from);
    const goal = idx(to);
    if (start === goal) return [];
    const prev = new Int32Array(cols * rows).fill(-1);
    prev[start] = start;
    const queue = [start];
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi]!;
      if (cur === goal) break;
      const cr = Math.floor(cur / cols);
      const cc = cur % cols;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const r = cr + dr;
          const c = cc + dc;
          if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
          const n = r * cols + c;
          if (prev[n] !== -1 || (grid[n] && n !== goal)) continue;
          if (dr && dc && (grid[cr * cols + c] || grid[r * cols + cc])) continue;
          prev[n] = cur;
          queue.push(n);
        }
      }
    }
    if (prev[goal] === -1) return [];
    const path: Vec2[] = [];
    for (let n = goal; n !== start; n = prev[n]!) {
      path.push({ x: ((n % cols) + 0.5) * TILE_SIZE, y: (Math.floor(n / cols) + 0.5) * TILE_SIZE });
    }
    return path.reverse();
  }
}

function markersFor(level: LevelDef): Marker[] {
  const out: Marker[] = [];
  for (const o of level.objectives) {
    if (o.type === 'reach') out.push({ id: o.id, kind: 'flag', x: o.target.x, y: o.target.y });
    if (o.type === 'waypoints') {
      o.points.forEach((p, i) => out.push({ id: `${o.id}.${i + 1}`, kind: 'waypoint', x: p.x, y: p.y, index: i + 1 }));
    }
    if (o.type === 'collect') {
      o.items.forEach((p, i) => out.push({ id: `${o.id}.${i + 1}`, kind: 'core', x: p.x, y: p.y, index: i + 1 }));
    }
  }
  return out;
}
