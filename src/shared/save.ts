import type { BotDesign } from './parts';

export type PlaybackSpeed = 0.5 | 1 | 2 | 4;

export interface LevelProgress {
  cleared: boolean;
  bestStars: 0 | 1 | 2 | 3;
  bestSeconds?: number;
  attempts: number;
}

export interface Profile {
  id: string;
  name: string;
  createdAt: number;
  /** Keyed by LevelDef.id. Unlocked parts are derived from this (see src/levels unlockedFor). */
  levels: Record<string, LevelProgress>;
  /** Last bot design per level id, plus 'free' for free play. */
  designs: Record<string, BotDesign>;
  /** Last script per level id; free play uses 'free:<levelId>' so each level keeps its own. */
  scripts: Record<string, string>;
  /** How many hints have been revealed per level id. */
  hintsShown: Record<string, number>;
  settings: { muted: boolean; speed: PlaybackSpeed };
}

export interface SaveData {
  version: 1;
  activeProfileId: string;
  profiles: Profile[];
}

/** What a share URL carries (lz-string compressed JSON in the #hash). */
export interface SharePayload {
  v: 1;
  name?: string;
  level?: string;
  design: BotDesign;
  script: string;
}
