import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Frame, WorldInit } from '../shared/frames';
import type { MainToWorker, WorkerToMain } from '../shared/protocol';
import type { MatchResult } from '../shared/result';
import { PythonRunner, type WorkerLike } from './client';
import { testDesign, testLevel } from './testSim';

class FakeWorker implements WorkerLike {
  posted: MainToWorker[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent<WorkerToMain>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage(message: MainToWorker) {
    this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  emit(data: WorkerToMain) {
    this.onmessage?.({ data } as MessageEvent<WorkerToMain>);
  }
}

const world: WorldInit = {
  walls: [],
  width: 400,
  height: 200,
  bots: [{ id: 'player', team: 'player', design: testDesign, start: { x: 0, y: 0, heading: 0 }, maxHp: 100, maxEnergy: 50 }],
  markers: [],
  seed: 1,
};

const frame = (tick: number, hp = 100): Frame => ({
  tick,
  bots: [{ id: 'player', x: 0, y: 0, heading: 0, hp, energy: 40, shield: false, alive: true, moving: false }],
  projectiles: [],
  events: tick === 0 ? [{ type: 'objective', objectiveId: 'goal', progress: 0, total: 1, done: false }] : [],
});

const req = { level: testLevel(), design: testDesign, script: 'pass', seed: 1 };

describe('PythonRunner', () => {
  let workers: FakeWorker[];
  let runner: PythonRunner;

  beforeEach(() => {
    vi.useFakeTimers();
    workers = [];
    runner = new PythonRunner({ createWorker: () => (workers.push(new FakeWorker()), workers.at(-1)!) });
  });
  afterEach(() => {
    runner.dispose();
    vi.useRealTimers();
  });

  /** Start a run on `worker` (booting it if need be); it posts the run there. */
  const startRun = async (worker = workers[0]!) => {
    const h = { onStarted: vi.fn(), onFrames: vi.fn(), onError: vi.fn(), onDone: vi.fn<(r: MatchResult) => void>(), onFatal: vi.fn() };
    const handle = runner.run(req, h);
    worker.emit({ type: 'ready', pyodideVersion: 'x' });
    await vi.advanceTimersByTimeAsync(0);
    const runId = (worker.posted.at(-1) as MainToWorker).runId;
    return { h, handle, runId, worker };
  };

  it('posts the run once Python is ready and relays messages', async () => {
    const { h, runId, worker } = await startRun();
    expect(worker.posted[0]).toMatchObject({ type: 'run', script: 'pass', seed: 1 });
    worker.emit({ type: 'started', runId, world });
    worker.emit({ type: 'frames', runId, frames: [frame(0)] });
    worker.emit({ type: 'frames', runId: runId + 99, frames: [frame(5)] }); // stale
    const result = { won: true } as MatchResult;
    worker.emit({ type: 'done', runId, result });
    expect(h.onStarted).toHaveBeenCalledWith(world);
    expect(h.onFrames).toHaveBeenCalledTimes(1);
    expect(h.onDone).toHaveBeenCalledWith(result);
  });

  it('watchdog: kills a silent worker, keeps frames and reports a lost run', async () => {
    const { h, runId, worker: first } = await startRun();
    first.emit({ type: 'started', runId, world });
    first.emit({ type: 'frames', runId, frames: [frame(0), frame(1, 80), frame(2, 70)] });
    await vi.advanceTimersByTimeAsync(2500);
    expect(h.onError).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);

    expect(h.onError).toHaveBeenCalledWith(expect.objectContaining({ type: 'Watchdog', tick: 2, friendly: expect.stringMatching(/thinking too hard/) }));
    expect(h.onDone.mock.calls[0]![0]).toMatchObject({
      won: false,
      reason: 'watchdog',
      ticks: 2,
      damageTaken: 30,
      energyLeft: 40,
      objectives: [{ id: 'goal', label: 'Reach the flag', progress: 0, total: 1, done: false }],
    });
    expect(first.terminated).toBe(true);
    expect(workers).toHaveLength(3); // the spare took over, and a new spare is booting
    // Late messages from the dead run are ignored.
    first.emit({ type: 'done', runId, result: {} as MatchResult });
    expect(h.onDone).toHaveBeenCalledTimes(1);
  });

  it('does not trip the watchdog while Python is still loading', async () => {
    const h = { onError: vi.fn() };
    runner.run(req, h);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.onError).not.toHaveBeenCalled();
  });

  it('reports a worker that cannot load Python', async () => {
    const h = { onFatal: vi.fn() };
    runner.run(req, h);
    workers[0]!.emit({ type: 'fatal', message: 'offline' });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.onFatal).toHaveBeenCalledWith('offline');
  });

  it('cancel terminates the worker and switches to the warm spare', async () => {
    const { h, handle, runId, worker } = await startRun();
    // Posting the run started a spare booting in the background.
    expect(workers).toHaveLength(2);
    const spare = workers[1]!;
    spare.emit({ type: 'ready', pyodideVersion: 'x' });
    worker.emit({ type: 'started', runId, world });
    handle.cancel();
    expect(worker.terminated).toBe(true);
    expect(runner.booted).toBe(true); // no reboot wait
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.onError).not.toHaveBeenCalled();
    // A new spare is already warming up for the next stop.
    expect(workers).toHaveLength(3);
    // The next run goes straight to the old spare.
    const next = await startRun(spare);
    expect(spare.posted).toEqual([expect.objectContaining({ type: 'run', runId: next.runId })]);
    expect(workers).toHaveLength(3);
  });

  it('keeps at most one spare and releases every killed worker', async () => {
    for (let i = 0; i < 10; i++) {
      const { handle, runId, worker } = await startRun(workers.find((w) => !w.terminated)!);
      worker.emit({ type: 'started', runId, world });
      handle.cancel();
    }
    const alive = workers.filter((w) => !w.terminated);
    expect(alive).toHaveLength(2); // the current worker and its spare
    expect(workers).toHaveLength(12); // the first, its first spare, and one new spare per kill
    // Killed workers are detached, so they can be garbage collected.
    for (const w of workers.filter((w) => w.terminated)) expect(w.onmessage).toBeNull();
    runner.dispose();
    expect(workers.every((w) => w.terminated)).toBe(true);
  });

  it('a run that ends normally keeps its worker and the spare', async () => {
    const { runId, worker } = await startRun();
    worker.emit({ type: 'done', runId, result: { won: true } as MatchResult });
    const again = await startRun(worker);
    worker.emit({ type: 'done', runId: again.runId, result: { won: true } as MatchResult });
    expect(workers).toHaveLength(2);
    expect(workers.some((w) => w.terminated)).toBe(false);
  });
});
