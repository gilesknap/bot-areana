/**
 * Module web worker: loads Pyodide from the CDN, then runs one script at a time with the sim
 * (see runtime.ts) and streams frames back to the main thread. Spawned by client.ts.
 */
import type { PyodideAPI } from 'pyodide';
import type { MainToWorker, WorkerToMain } from '../shared/protocol';
import { createMatch } from '../sim';
import { lockDownGlobals } from './lockdown';
import { executeRun, prepareRuntime, scriptError } from './runtime';
import { PYODIDE_CDN } from './version';

const scope = self as unknown as {
  postMessage(message: WorkerToMain): void;
  onmessage: ((event: MessageEvent<MainToWorker>) => void) | null;
};
// Kept before lockDownGlobals() removes postMessage, so scripts can't forge results to the page.
const postMessage = scope.postMessage.bind(scope);
const post = (message: WorkerToMain) => postMessage(message);

async function boot(): Promise<PyodideAPI> {
  const { loadPyodide } = (await import(/* @vite-ignore */ `${PYODIDE_CDN}pyodide.mjs`)) as typeof import('pyodide');
  const py = await loadPyodide({ indexURL: PYODIDE_CDN, env: { PYTHONHASHSEED: '0' } });
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
      onFrames: (frames, lines) => {
        tick = frames.at(-1)?.tick ?? tick;
        post({ type: 'frames', runId, frames, lines });
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
