/**
 * Seals the worker once Pyodide has loaded. Scripts can come from strangers via share links, and
 * Python in Pyodide can always find a way back to JavaScript objects (frames, gc, the bridge), so
 * this is the real boundary: with it in place, JavaScript reachable from Python can't touch the
 * network or storage, start other threads, message the page, or compile new code (which would
 * also give it `import()`). Nothing here is needed after loading.
 */

const BLOCKED = [
  'fetch', 'XMLHttpRequest', 'WebSocket', 'WebSocketStream', 'WebTransport', 'EventSource',
  'indexedDB', 'caches', 'importScripts', 'BroadcastChannel', 'Worker', 'SharedWorker',
  'postMessage', 'eval',
];

function seal(target: object, name: string, value: unknown, locked = true): void {
  try {
    Object.defineProperty(target, name, { value, configurable: !locked, writable: !locked });
  } catch {
    // Already sealed, or the browser doesn't allow it; nothing more we can do.
  }
}

/** Call after Pyodide has loaded, keeping any functions you still need (e.g. postMessage) first. */
export function lockDownGlobals(scope: object = globalThis): void {
  // Down the prototype chain too, so WorkerGlobalScope.prototype.fetch.call(self) doesn't work.
  for (let o: object | null = scope; o && o !== Object.prototype; o = Object.getPrototypeOf(o) as object | null) {
    for (const name of BLOCKED) if (Object.hasOwn(o, name)) seal(o, name, undefined);
  }

  // Timers run a string argument as code. (Left writable: a wrapper can't be undone by replacing it.)
  const g = scope as Record<string, unknown>;
  for (const name of ['setTimeout', 'setInterval']) {
    const real = g[name];
    if (typeof real !== 'function') continue;
    seal(scope, name, (handler: unknown, ...rest: unknown[]) =>
      typeof handler === 'function' ? (real as (...a: unknown[]) => unknown).call(scope, handler, ...rest) : 0,
    false);
  }

  // Any function's .constructor (Function, AsyncFunction, ...) compiles code from a string. Swap
  // each for a stand-in with the same name and prototype, so instanceof checks still work.
  const kinds = [function () {}, async function () {}, function* () {}, async function* () {}];
  for (const proto of kinds.map((f) => Object.getPrototypeOf(f) as object)) {
    const name = (proto as { constructor: { name: string } }).constructor.name;
    const standIn = {
      [name]: function () {
        throw new EvalError('Compiling code is disabled in the Bot Arena worker');
      },
    }[name]!;
    seal(standIn, 'prototype', proto);
    seal(proto, 'constructor', standIn);
    if (name === 'Function') seal(scope, 'Function', standIn);
  }
}
