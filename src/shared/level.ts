import type { Pose, Rect, Vec2 } from './geometry';
import type { BotDesign, UnlockId } from './parts';

/**
 * Arena map characters, one per TILE_SIZE x TILE_SIZE cell. The outer edge of the arena is
 * always walled, so maps don't need a '#' border.
 */
export const TILE_CHARS = {
  '.': 'floor',
  ' ': 'floor',
  '#': 'wall',
  L: 'lava',
  W: 'water',
  P: 'pit',
  R: 'rough',
} as const;
export type TileChar = keyof typeof TILE_CHARS;

export type BehaviourId = 'static' | 'patrol' | 'chase' | 'turret' | 'kamikaze' | 'coward';

export interface BehaviourParams {
  /** patrol: loop of points to visit. */
  route?: Vec2[];
  /** Notices the player within this many world units (default per behaviour). */
  sightRange?: number;
  /** Opens fire within this many world units. */
  fireRange?: number;
  /** coward: flee once hp falls below this fraction (0..1). */
  fleeBelow?: number;
  /** Multiplier on the design's top speed (tuning knob, default 1). */
  speedFactor?: number;
  /** Extra seconds between shots on top of the blaster's 1 s cooldown (tuning knob). */
  fireDelay?: number;
  /** Ticks to wait before activating. */
  delay?: number;
}

export interface EnemyDef {
  /** Unique within the level, e.g. 'turret1'. Used by destroy objectives and SimEvents. */
  id: string;
  behaviour: BehaviourId;
  design: BotDesign;
  spawn: Pose;
  params?: BehaviourParams;
}

/** All objectives must be complete to win. */
export type Objective =
  | { type: 'reach'; id: string; label: string; target: Vec2; radius: number }
  | { type: 'waypoints'; id: string; label: string; points: Vec2[]; radius: number }
  | { type: 'destroy'; id: string; label: string; /** default: every enemy */ enemies?: string[] }
  | { type: 'collect'; id: string; label: string; items: Vec2[]; radius: number }
  | { type: 'survive'; id: string; label: string; seconds: number };

/** Star 1 is always "complete the level"; stars 2 and 3 come from LevelDef.stars. */
export type StarCriterion =
  | { type: 'time'; seconds: number; label: string }
  | { type: 'damage'; max: number; label: string }
  | { type: 'lines'; max: number; label: string }
  /** min is percent of capacity left (0-100). */
  | { type: 'energy'; min: number; label: string };

export interface LevelDef {
  /** 'l01'..'l10' */
  id: string;
  number: number;
  title: string;
  /** Short concept tag for the campaign grid, e.g. 'while'. */
  concept: string;
  /** Mission briefing paragraph(s). */
  brief: string;
  /** "NEW IN PYTHON" box on the briefing. */
  lesson: { title: string; snippet: string; blurb: string };
  /** Map rows (see TILE_CHARS); arena size = columns x rows tiles. */
  map: string[];
  /** Extra free-placed walls (world units), on top of '#' tiles. */
  walls?: Rect[];
  /** Seeded variation: the sim picks `count` of the option groups using the run's seed. */
  randomWalls?: { options: Rect[][]; count: number };
  spawn: Pose;
  objectives: Objective[];
  /** Lose when the clock passes this (seconds). Default MAX_MATCH_SECONDS. */
  timeLimit?: number;
  enemies: EnemyDef[];
  budget: { weight: number; power: number };
  /** Parts/chassis that become available from this level on (briefing "UNLOCKS · ..."). */
  unlocks: UnlockId[];
  stars: [StarCriterion, StarCriterion];
  /** Default seed for runs of this level. */
  seed: number;
  starter: string;
  /** Up to 3, progressively more revealing. */
  hints: string[];
  /** Painted hall marking for flair, e.g. 'B-07'. */
  label?: string;
  /** Reference solution, used by the headless level tests (never bundled into the game). */
  solution: {
    design: BotDesign;
    /** Path relative to src/levels/, e.g. 'solutions/l01.py'. */
    script: string;
  };
}

/** Hard cap on any match, seconds of simulated time. */
export const MAX_MATCH_SECONDS = 180;
