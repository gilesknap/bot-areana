/**
 * Module web worker: loads Pyodide from the CDN, then runs one script at a time with the sim
 * (see runtime.ts) and streams frames back to the main thread. Spawned by client.ts.
 */
import type { PyodideAPI } from 'pyodide';
import type { MainToWorker, WorkerToMain } from '../shared/protocol';
import { createMatch } from '../sim';
import { executeRun, prepareRuntime, scriptError } from './runtime';
import { PYODIDE_CDN } from './version';

const scope = self as unknown as {
  postMessage(message: WorkerToMain): void;
  onmessage: ((event: MessageEvent<MainToWorker>) => void) | null;
};
const post = (message: WorkerToMain) => scope.postMessage(message);

/**
 * Scripts can come from strangers via share links. Python-level blocks (bootstrap.py) stop
 * casual access to JavaScript, but Pyodide can't be sealed completely, so the worker also drops
 * every way out: network, storage and nested workers. Nothing here is needed once Pyodide loaded.
 */
function lockDownGlobals(): void {
  const names = [
    'fetch', 'XMLHttpRequest', 'WebSocket', 'WebTransport', 'EventSource', 'indexedDB', 'caches',
    'importScripts', 'BroadcastChannel', 'Worker', 'SharedWorker',
  ];
  for (const name of names) {
    try {
      Object.defineProperty(self, name, { value: undefined, configurable: false, writable: false });
    } catch {
      // Not present in this browser.
    }
  }
}

async function boot(): Promise<PyodideAPI> {
  const { loadPyodide } = (await import(/* @vite-ignore */ `${PYODIDE_CDN}pyodide.mjs`)) as typeof import('pyodide');
  const py = await loadPyodide({ indexURL: PYODIDE_CDN });
  prepareRuntime(py);
  lockDownGlobals();
  return py;
}

const booting = boot();
booting.then(
  (py) => post({ type: 'ready', pyodideVersion: py.version }),
  (e: unknown) => post({ type: 'fatal', message: `Python failed to load: ${e instanceof Error ? e.message : String(e)}` }),
);

scope.onmessage = async (event) => {
  const msg = event.data;
  if (msg.type !== 'run') return;
  const py = await booting;
  const { runId } = msg;
  let tick = 0;
  try {
    const { result } = executeRun(py, createMatch, msg, {
      onStarted: (world) => post({ type: 'started', runId, world }),
      onFrames: (frames) => {
        tick = frames.at(-1)!.tick;
        post({ type: 'frames', runId, frames });
      },
      onError: (error) => post({ type: 'error', runId, error }),
    });
    post({ type: 'done', runId, result });
  } catch (e) {
    // A bug outside the player's script (e.g. in the sim). The client turns this into a lost run.
    const message = e instanceof Error ? e.message : String(e);
    post({ type: 'error', runId, error: scriptError('InternalError', message, tick) });
    post({ type: 'fatal', message });
  }
};
