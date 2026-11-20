/**
 * The Python runtime, shared by the web worker and headless Node runs. Environment-agnostic:
 * it is handed a loaded Pyodide and a `createMatch`, and reports through callbacks.
 *
 * Flow of one run: createMatch -> build `bot` from the design -> exec the script as main.py.
 * Every bot method call crosses the bridge as JSON, steps the sim via SimMatch.call(), and
 * returns the result. Frames are flushed to `onFrames` at least every `flushMs` of wall time.
 */
import type { PyodideAPI } from 'pyodide';
import type { PyProxy } from 'pyodide/ffi';
import { BotApiError, MatchOver, WATCHDOG_MESSAGE, WATCHDOG_TIP, type ScriptError } from '../shared/errors';
import type { Frame, LineRecord, WorldInit } from '../shared/frames';
import type { CreateMatch, PyValue, RunRequest, SimMatch } from '../shared/protocol';
import type { MatchResult } from '../shared/result';
import { countScriptLines } from '../shared/script';
import BOOTSTRAP from './bootstrap.py?raw';
import { botSource } from './codegen';
import { explainError } from './friendly';

/** Print events kept per tick; a runaway print loop gets one notice instead of thousands of lines. */
export const MAX_PRINTS_PER_TICK = 200;

export interface RunHooks {
  onStarted?(world: WorldInit): void;
  /** New frames, and the script lines that started since the last batch (see LineRecord). */
  onFrames(frames: Frame[], lines: LineRecord[]): void;
  onError?(error: ScriptError): void;
  /** Wall-time between frame flushes while the script runs (default 50 ms). */
  flushMs?: number;
  /**
   * Stop the script after this much wall time without a bot call. Only for headless runs: it
   * uses sys.settrace, which slows Python down. In the browser the client's watchdog does this.
   */
  watchdogMs?: number;
}

export interface RunOutcome {
  world: WorldInit;
  result: MatchResult;
  error?: ScriptError;
}

type RunPlayer = (bridge: (op: string, payload: string) => string, source: string, script: string, seed: number, watchdogSeconds: number) => string;

type PlayerStatus = { lines: number[] } & (
  | { status: 'ok' | 'over' }
  | { status: 'watchdog'; line: number | null }
  | { status: 'internal'; message: string }
  | { status: 'error'; type: string; message: string; line: number | null; game: boolean }
);

const prepared = new WeakMap<PyodideAPI, PyProxy>();

/** Install the bridge and sandbox in this interpreter (once; later calls are no-ops). */
export function prepareRuntime(py: PyodideAPI): void {
  if (prepared.has(py)) return;
  const namespace = py.globals.get('dict')() as PyProxy;
  py.runPython(BOOTSTRAP, { globals: namespace, filename: '<bot-arena>' });
  prepared.set(py, namespace.get('run_player') as PyProxy);
  namespace.destroy();
}

/** Build a ScriptError from a Python exception, with friendly text. */
export function scriptError(type: string, message: string, tick: number, line?: number): ScriptError {
  const { friendly, tip } = explainError(type, message);
  const error: ScriptError = { type, message, tick, friendly };
  if (line != null) error.line = line;
  if (tip) error.tip = tip;
  return error;
}

/** Run one script against a fresh match. Synchronous apart from what Pyodide itself does. */
export function executeRun(py: PyodideAPI, createMatch: CreateMatch, req: RunRequest, hooks: RunHooks): RunOutcome {
  prepareRuntime(py);
  const runPlayer = prepared.get(py) as unknown as RunPlayer;
  const match = createMatch({ level: req.level, design: req.design, seed: req.seed, scriptLines: countScriptLines(req.script) });
  hooks.onStarted?.(match.world);

  const flushMs = hooks.flushMs ?? 50;
  let lastFlush = performance.now();
  let lines: LineRecord[] = [];
  const addLines = (numbers: number[]) => {
    for (const line of numbers) lines.push({ tick: match.tick, line });
  };
  const flush = () => {
    lastFlush = performance.now();
    const frames = match.takeFrames();
    if (frames.length || lines.length) hooks.onFrames(frames, lines);
    lines = [];
  };
  // Send the start frame now: if the script then loops without calling the bot and the worker
  // is killed, playback still has a frame to show the error and result at.
  flush();

  const bridge = makeBridge(match, addLines, () => {
    if (performance.now() - lastFlush >= flushMs) flush();
  });
  const raw = runPlayer(bridge, botSource(req.design), req.script, req.seed, (hooks.watchdogMs ?? 0) / 1000);
  const status = JSON.parse(raw) as PlayerStatus;
  addLines(status.lines);

  let error: ScriptError | undefined;
  if (!match.finished) {
    switch (status.status) {
      case 'ok':
      case 'over':
        match.finish();
        break;
      case 'error':
        error = scriptError(status.type, status.message, match.tick, status.line ?? undefined);
        break;
      case 'watchdog':
        error = { type: 'Watchdog', message: WATCHDOG_MESSAGE, friendly: WATCHDOG_MESSAGE, tip: WATCHDOG_TIP, tick: match.tick };
        if (status.line != null) error.line = status.line;
        break;
      case 'internal':
        error = scriptError('InternalError', status.message, match.tick);
        break;
    }
  }
  if (error) {
    // Frames up to the error first, so the console line lands at the right moment in playback.
    flush();
    hooks.onError?.(error);
    match.abort(error.type === 'Watchdog' ? 'watchdog' : error.type === 'InternalError' ? 'aborted' : 'script_error');
  }
  flush();
  const outcome: RunOutcome = { world: match.world, result: match.result() };
  if (error) outcome.error = error;
  return outcome;
}

/** The single JS function Python may call: `bridge(op, json) -> json`. Never throws into Python. */
function makeBridge(match: SimMatch, addLines: (lines: number[]) => void, afterCall: () => void) {
  let printTick = -1;
  let printsThisTick = 0;

  const print = (text: string, stream: 'stdout' | 'stderr' | 'log') => {
    if (match.tick !== printTick) {
      printTick = match.tick;
      printsThisTick = 0;
    }
    printsThisTick++;
    if (printsThisTick <= MAX_PRINTS_PER_TICK) match.print(text, stream);
    else if (printsThisTick === MAX_PRINTS_PER_TICK + 1) match.print('... (too much output - some lines hidden)', 'stderr');
  };

  const call = (attr: string, method: string, args: PyValue[], lines: number[]): string => {
    if (match.finished) return '{"over":true}';
    addLines(lines);
    try {
      const value = match.call(attr, method, args);
      return JSON.stringify({ value: value ?? null });
    } catch (e) {
      if (e instanceof MatchOver || (e as Error)?.name === 'MatchOver') return '{"over":true}';
      if (e instanceof BotApiError) return JSON.stringify({ error: e.errorName, message: e.message });
      throw e;
    } finally {
      afterCall();
    }
  };

  return (op: string, payload: string): string => {
    try {
      const args = JSON.parse(payload) as PyValue[];
      if (op === 'call') return call(args[0] as string, args[1] as string, args[2] as PyValue[], args[3] as number[]);
      if (op === 'print') {
        print(args[0] as string, args[1] as 'stdout' | 'stderr' | 'log');
        return '{}';
      }
      return JSON.stringify({ internal: `unknown bridge op ${op}` });
    } catch (e) {
      return JSON.stringify({ internal: e instanceof Error ? e.message : String(e) });
    }
  };
}
