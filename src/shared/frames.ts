/**
 * The stream the sim produces and the renderer plays back. One Frame per simulated tick.
 */
import type { Pose, Rect, Vec2 } from './geometry';
import type { BehaviourId } from './level';
import type { BotDesign, DirectionalSlot, Terrain } from './parts';

export type Team = 'player' | 'enemy';

/** Static description of the world for a run, sent once before any frames. */
export interface WorldInit {
  /** All solid walls after randomWalls were resolved ('#' tiles included, merged where possible). */
  walls: Rect[];
  width: number;
  height: number;
  bots: Array<{
    /** 'player' for the player's bot, else EnemyDef.id */
    id: string;
    team: Team;
    design: BotDesign;
    behaviour?: BehaviourId;
    start: Pose;
    maxHp: number;
    maxEnergy: number;
  }>;
  /** Data cores, flag, waypoints - things drawn on the floor. */
  markers: Array<{ id: string; kind: 'flag' | 'waypoint' | 'core'; x: number; y: number; index?: number }>;
  seed: number;
}

export interface BotFrame {
  id: string;
  x: number;
  y: number;
  heading: number;
  hp: number;
  energy: number;
  shield: boolean;
  alive: boolean;
  /** Currently driving or turning (for wheel/track animation, dust). */
  moving: boolean;
}

export interface ProjectileFrame {
  id: number;
  x: number;
  y: number;
  heading: number;
  owner: string;
}

export type SimEvent =
  | { type: 'muzzle_flash'; botId: string; slot: DirectionalSlot; x: number; y: number; heading: number }
  | { type: 'hit'; targetId: string | 'wall'; x: number; y: number; damage: number; side?: DirectionalSlot; shielded?: boolean }
  | { type: 'explosion'; x: number; y: number; size: 'small' | 'large' }
  | { type: 'destroyed'; botId: string; x: number; y: number; cause: 'damage' | 'pit' | 'lava' }
  | { type: 'scan'; botId: string; range: number }
  | { type: 'range'; botId: string; slot: DirectionalSlot; distance: number }
  | { type: 'bump'; botId: string; side: DirectionalSlot }
  | { type: 'shield'; botId: string; on: boolean }
  | { type: 'hazard'; botId: string; terrain: Terrain; at: Vec2 }
  | { type: 'marker'; markerId: string; state: 'reached' | 'collected' }
  | { type: 'objective'; objectiveId: string; progress: number; total: number; done: boolean }
  | { type: 'print'; text: string; stream: 'stdout' | 'stderr' | 'log' }
  | { type: 'low_energy'; botId: string };

export interface Frame {
  tick: number;
  bots: BotFrame[];
  projectiles: ProjectileFrame[];
  /** Things that happened during this tick. */
  events: SimEvent[];
}
