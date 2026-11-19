/**
 * Contracts between the Python runtime, the sim, and the main thread.
 */
import type { ScriptError } from './errors';
import type { Frame, WorldInit } from './frames';
import type { LevelDef } from './level';
import type { BotDesign } from './parts';
import type { MatchResult } from './result';

/** Values that cross the Python <-> sim bridge (Python gets tuples for 2-element position lists). */
export type PyValue = number | boolean | string | null | PyValue[] | { [key: string]: PyValue };

export interface MatchOptions {
  level: LevelDef;
  design: BotDesign;
  seed: number;
  /** Non-blank, non-comment lines of the script, for 'lines' star criteria. */
  scriptLines: number;
}

/**
 * One deterministic match, implemented by src/sim (createMatch). Driven synchronously by the
 * Python runtime: every bot API call steps the sim until that action resolves.
 */
export interface SimMatch {
  readonly world: WorldInit;
  readonly tick: number;
  readonly finished: boolean;
  /**
   * Run one API call for the player's bot. `attr` is the FittedApi attr ('' for core methods
   * on `bot` itself), `method` the method name, `args` positional args after Python defaults
   * have been applied (so forward(100) arrives as [100, true]).
   * Throws BotApiError for game errors, MatchOver if the match ends before the call resolves.
   */
  call(attr: string, method: string, args: PyValue[]): PyValue;
  /** Record console output at the current tick (no time passes). */
  print(text: string, stream: 'stdout' | 'stderr' | 'log'): void;
  /** Script ended normally: keep simulating with the bot idle until the match ends. */
  finish(): void;
  /** Script crashed or was stopped: end the match now with this reason. */
  abort(reason: 'script_error' | 'watchdog' | 'aborted'): void;
  /** Frames produced since the last call (each tick exactly once, in order). */
  takeFrames(): Frame[];
  /** Valid once `finished`. */
  result(): MatchResult;
}

export type CreateMatch = (opts: MatchOptions) => SimMatch;

// ---- Web Worker messages ------------------------------------------------------------------

export interface RunRequest {
  level: LevelDef;
  design: BotDesign;
  script: string;
  seed: number;
}

export type MainToWorker = { type: 'run'; runId: number } & RunRequest;

export type WorkerToMain =
  /** Pyodide loaded; the worker accepts 'run'. */
  | { type: 'ready'; pyodideVersion: string }
  /** Worker could not start (e.g. Pyodide failed to download). */
  | { type: 'fatal'; message: string }
  | { type: 'started'; runId: number; world: WorldInit }
  /** Sent at least every ~50 ms of wall time while the script makes API calls. */
  | { type: 'frames'; runId: number; frames: Frame[] }
  | { type: 'error'; runId: number; error: ScriptError }
  | { type: 'done'; runId: number; result: MatchResult };
