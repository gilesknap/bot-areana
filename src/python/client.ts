/**
 * Main-thread side of the Python bridge: owns the worker, relays a run's frames and result,
 * and runs the watchdog. A script stuck in a loop that never calls the bot keeps the worker
 * busy forever; after `watchdogMs` of silence the worker is terminated (keeping the frames
 * already received), a lost result is reported and a fresh worker is started.
 */
import { WATCHDOG_MESSAGE, WATCHDOG_TIP, type ScriptError } from '../shared/errors';
import type { Frame, WorldInit } from '../shared/frames';
import { TICK_RATE } from '../shared/geometry';
import type { MainToWorker, RunRequest, WorkerToMain } from '../shared/protocol';
import type { EndReason, MatchResult, ObjectiveProgress } from '../shared/result';

export interface RunHandlers {
  onStarted?(world: WorldInit): void;
  onFrames?(frames: Frame[]): void;
  onError?(error: ScriptError): void;
  onDone?(result: MatchResult): void;
  /** Python could not be loaded at all (e.g. offline). */
  onFatal?(message: string): void;
}

/** The parts of Worker the runner uses (lets tests pass a fake). */
export interface WorkerLike {
  postMessage(message: MainToWorker): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<WorkerToMain>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

export interface PythonRunnerOptions {
  createWorker?: () => WorkerLike;
  /** Silence after 'started' before the worker is killed (default 3000 ms). */
  watchdogMs?: number;
}

interface ActiveRun {
  id: number;
  req: RunRequest;
  handlers: RunHandlers;
  world?: WorldInit;
  lastHeard: number;
  lastFrame?: Frame;
  objectives: Map<string, ObjectiveProgress>;
  errored: boolean;
}

const defaultWorker = (): WorkerLike =>
  new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

export class PythonRunner {
  /** Resolves when Python is loaded; rejects if it can't be. Replaced when the worker restarts. */
  ready!: Promise<void>;
  private worker!: WorkerLike;
  private isReady = false;
  private active: ActiveRun | null = null;
  private nextId = 1;
  private readonly createWorker: () => WorkerLike;
  private readonly watchdogMs: number;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(options: PythonRunnerOptions = {}) {
    this.createWorker = options.createWorker ?? defaultWorker;
    this.watchdogMs = options.watchdogMs ?? 3000;
    this.spawn();
    this.timer = setInterval(() => this.checkWatchdog(), Math.min(250, this.watchdogMs / 4));
  }

  /** True once the current worker has Python loaded. */
  get booted(): boolean {
    return this.isReady;
  }

  /** Start a run (cancelling any run in progress). Handlers fire as messages arrive. */
  run(req: RunRequest, handlers: RunHandlers): { cancel(): void } {
    if (this.active) this.cancelActive();
    const run: ActiveRun = { id: this.nextId++, req, handlers, lastHeard: Date.now(), objectives: new Map(), errored: false };
    this.active = run;
    this.ready.then(
      () => {
        if (this.active !== run) return;
        run.lastHeard = Date.now();
        this.worker.postMessage({ type: 'run', runId: run.id, ...req });
      },
      (e: unknown) => {
        if (this.active === run) this.active = null;
        handlers.onFatal?.(e instanceof Error ? e.message : String(e));
      },
    );
    return { cancel: () => this.active === run && this.cancelActive() };
  }

  dispose(): void {
    clearInterval(this.timer);
    this.active = null;
    this.worker.terminate();
  }

  private spawn(): void {
    const worker = this.createWorker();
    this.worker = worker;
    this.isReady = false;
    this.ready = new Promise<void>((resolve, reject) => {
      worker.onmessage = (event) => {
        const msg = event.data;
        if (msg.type === 'ready') {
          this.isReady = true;
          resolve();
        }
        else if (msg.type === 'fatal') {
          reject(new Error(msg.message));
          this.onWorkerFailed(msg.message);
        } else this.onRunMessage(msg);
      };
      worker.onerror = (event) => {
        const message = event.message || 'the Python worker crashed';
        reject(new Error(message));
        this.onWorkerFailed(message);
      };
    });
    // Callers that never run anything shouldn't see an unhandled rejection.
    this.ready.catch(() => {});
  }

  private onRunMessage(msg: Exclude<WorkerToMain, { type: 'ready' | 'fatal' }>): void {
    const run = this.active;
    if (!run || msg.runId !== run.id) return; // stale run
    run.lastHeard = Date.now();
    switch (msg.type) {
      case 'started':
        run.world = msg.world;
        run.handlers.onStarted?.(msg.world);
        break;
      case 'frames':
        for (const frame of msg.frames) {
          for (const e of frame.events) {
            if (e.type === 'objective') {
              const label = run.req.level.objectives.find((o) => o.id === e.objectiveId)?.label ?? e.objectiveId;
              run.objectives.set(e.objectiveId, { id: e.objectiveId, label, progress: e.progress, total: e.total, done: e.done });
            }
          }
        }
        run.lastFrame = msg.frames.at(-1) ?? run.lastFrame;
        run.handlers.onFrames?.(msg.frames);
        break;
      case 'error':
        run.errored = true;
        run.handlers.onError?.(msg.error);
        break;
      case 'done':
        this.active = null;
        run.handlers.onDone?.(msg.result);
        break;
    }
  }

  private checkWatchdog(): void {
    const run = this.active;
    if (!run?.world || Date.now() - run.lastHeard < this.watchdogMs) return;
    const tick = run.lastFrame?.tick ?? 0;
    run.handlers.onError?.({ type: 'Watchdog', message: WATCHDOG_MESSAGE, friendly: WATCHDOG_MESSAGE, tip: WATCHDOG_TIP, tick });
    this.restart();
    run.handlers.onDone?.(lostResult(run, 'watchdog'));
  }

  /** The worker died or hit an internal error mid-run: end the run as lost and start over. */
  private onWorkerFailed(message: string): void {
    const run = this.active;
    // Before 'ready' the rejected `ready` promise reports it (onFatal) instead.
    if (!run || !this.isReady) return;
    if (!run.errored) {
      run.handlers.onError?.({ type: 'InternalError', message, tick: run.lastFrame?.tick ?? 0, friendly: 'Something went wrong inside Bot Arena itself - not your code. Try running again.' });
    }
    this.restart();
    run.handlers.onDone?.(lostResult(run, 'aborted'));
  }

  /** Stopping a script mid-run means killing the worker: Python can't be interrupted otherwise. */
  private cancelActive(): void {
    this.restart();
  }

  private restart(): void {
    this.active = null;
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.terminate();
    this.spawn();
  }
}

/** A MatchResult for a run the worker could not finish, built from the frames received. */
export function lostResult(run: Pick<ActiveRun, 'world' | 'lastFrame' | 'objectives'>, reason: EndReason): MatchResult {
  const ticks = run.lastFrame?.tick ?? 0;
  const player = run.lastFrame?.bots.find((b) => b.id === 'player');
  const maxHp = run.world?.bots.find((b) => b.id === 'player')?.maxHp ?? 0;
  return {
    won: false,
    reason,
    stars: 0,
    starFlags: [false, false, false],
    ticks,
    seconds: ticks / TICK_RATE,
    damageTaken: player ? Math.max(0, maxHp - player.hp) : 0,
    energyLeft: player?.energy ?? 0,
    objectives: [...run.objectives.values()],
  };
}
