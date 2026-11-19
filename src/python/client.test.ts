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
  const latest = () => workers.at(-1)!;

  beforeEach(() => {
    vi.useFakeTimers();
    workers = [];
    runner = new PythonRunner({ createWorker: () => (workers.push(new FakeWorker()), latest()) });
  });
  afterEach(() => {
    runner.dispose();
    vi.useRealTimers();
  });

  const startRun = async () => {
    const h = { onStarted: vi.fn(), onFrames: vi.fn(), onError: vi.fn(), onDone: vi.fn<(r: MatchResult) => void>(), onFatal: vi.fn() };
    const handle = runner.run(req, h);
    latest().emit({ type: 'ready', pyodideVersion: 'x' });
    await vi.advanceTimersByTimeAsync(0);
    const runId = (latest().posted[0] as MainToWorker).runId;
    return { h, handle, runId };
  };

  it('posts the run once Python is ready and relays messages', async () => {
    const { h, runId } = await startRun();
    expect(latest().posted[0]).toMatchObject({ type: 'run', script: 'pass', seed: 1 });
    latest().emit({ type: 'started', runId, world });
    latest().emit({ type: 'frames', runId, frames: [frame(0)] });
    latest().emit({ type: 'frames', runId: runId + 99, frames: [frame(5)] }); // stale
    const result = { won: true } as MatchResult;
    latest().emit({ type: 'done', runId, result });
    expect(h.onStarted).toHaveBeenCalledWith(world);
    expect(h.onFrames).toHaveBeenCalledTimes(1);
    expect(h.onDone).toHaveBeenCalledWith(result);
  });

  it('watchdog: kills a silent worker, keeps frames and reports a lost run', async () => {
    const { h, runId } = await startRun();
    const first = latest();
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
    expect(workers).toHaveLength(2);
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
    latest().emit({ type: 'fatal', message: 'offline' });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.onFatal).toHaveBeenCalledWith('offline');
  });

  it('cancel terminates the worker and starts a fresh one', async () => {
    const { h, handle, runId } = await startRun();
    latest().emit({ type: 'started', runId, world });
    handle.cancel();
    expect(workers[0]!.terminated).toBe(true);
    expect(workers).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.onError).not.toHaveBeenCalled();
  });
});
