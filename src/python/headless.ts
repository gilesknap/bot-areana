/**
 * Headless runs for Node (level tests, balance checks): the same runtime.ts and sim as the
 * browser worker, with Pyodide from the npm package. The interpreter is loaded once and reused.
 */
import type { PyodideAPI } from 'pyodide';
import type { ScriptError } from '../shared/errors';
import type { Frame, LineRecord, WorldInit } from '../shared/frames';
import type { LevelDef } from '../shared/level';
import type { BotDesign } from '../shared/parts';
import type { CreateMatch, RunRequest } from '../shared/protocol';
import type { MatchResult } from '../shared/result';
import { executeRun, prepareRuntime } from './runtime';

export interface HeadlessRun {
  world: WorldInit;
  frames: Frame[];
  /** Lines of the script as they started (see LineRecord). */
  lines: LineRecord[];
  result: MatchResult;
  error?: ScriptError;
  /** Console output in order: print() text, bot.log() text. */
  prints: string[];
}

export interface HeadlessOptions {
  /** Defaults to the real sim (src/sim). */
  createMatch?: CreateMatch;
  /** Wall-clock ms without a bot call before the script is stopped (default 3000, 0 = off). */
  watchdogMs?: number;
}

let pyodide: Promise<PyodideAPI> | undefined;

/** The shared Node Pyodide instance, sandboxed and ready to run scripts. */
export function headlessPyodide(): Promise<PyodideAPI> {
  pyodide ??= import('pyodide').then(async ({ loadPyodide }) => {
    const py = await loadPyodide({ env: { PYTHONHASHSEED: '0' } });
    prepareRuntime(py);
    return py;
  });
  return pyodide;
}

export async function runHeadless(req: RunRequest, options: HeadlessOptions = {}): Promise<HeadlessRun> {
  const py = await headlessPyodide();
  const createMatch = options.createMatch ?? (await import('../sim')).createMatch;
  const frames: Frame[] = [];
  const lines: LineRecord[] = [];
  const outcome = executeRun(py, createMatch, req, {
    onFrames: (batch, newLines) => {
      frames.push(...batch);
      lines.push(...newLines);
    },
    watchdogMs: options.watchdogMs ?? 3000,
  });
  const prints = frames.flatMap((f) => f.events.flatMap((e) => (e.type === 'print' ? [e.text] : [])));
  return { ...outcome, frames, lines, prints };
}

/** Convenience wrapper for level tests. */
export function runMatchHeadless(
  level: LevelDef,
  design: BotDesign,
  script: string,
  seed = level.seed,
  options?: HeadlessOptions,
): Promise<HeadlessRun> {
  return runHeadless({ level, design, script, seed }, options);
}
