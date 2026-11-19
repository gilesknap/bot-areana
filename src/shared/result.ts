export type EndReason =
  | 'objectives_complete'
  | 'bot_destroyed'
  | 'time_up'
  | 'script_error'
  | 'watchdog'
  | 'aborted';

export interface ObjectiveProgress {
  id: string;
  label: string;
  progress: number;
  total: number;
  done: boolean;
}

export interface MatchResult {
  won: boolean;
  reason: EndReason;
  /** 0 when lost; otherwise 1 + extra stars earned. */
  stars: 0 | 1 | 2 | 3;
  /** [completed, LevelDef.stars[0] met, LevelDef.stars[1] met] */
  starFlags: [boolean, boolean, boolean];
  ticks: number;
  seconds: number;
  damageTaken: number;
  /** Percent of capacity (0-100), the same scale as battery.level(). */
  energyLeft: number;
  objectives: ObjectiveProgress[];
}
