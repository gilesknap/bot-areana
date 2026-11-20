# Bot vs bot: running two Python bots in one match (design proposal)

Status: **proposal for review**, no code yet. Companion to [design.md](design.md) and
[architecture.md](architecture.md).

## Goal

A later mode where two Python bots fight in one arena:

- **Duel with a friend's bot**: load a bot (design + script) from a share URL and fight it with
  your own.
- **Hot seat**: two players on one machine, each with their own bot.

Both scripts are ordinary Bot Arena scripts. Ideally a novice sees **no API change**: the same
blocking `bot.drive.forward(100)`, `while True:` loops, the same tick costs, and an opponent that
shows up in `bot.radar.scan()` like any enemy does today.

## Why this is hard with today's architecture

Today one Pyodide interpreter runs in one module worker, and the sim runs inside it. Every bot API
call is a synchronous JavaScript call that steps the sim until the action resolves and then
returns (`match.call` in `src/sim/match.ts`, called through the bridge in `src/python/runtime.ts`).
`bot.drive.forward(100)` returns only after the sim has run the ~100 ticks it takes. Enemies are
TypeScript behaviours, so the sim can run them inside those ticks without asking anyone.

A second Python bot breaks this: while bot A's `forward(100)` is stepping the sim, bot B's script
must get to run whenever B's own call resolves, part-way through A's call, and A's call must not
return until the sim reaches A's resolution tick. Each script has to **pause mid-call** with its
Python stack intact while the other one runs. Plain synchronous JavaScript calls cannot do that.
Something has to suspend a Python stack: a second thread that can block, or stack switching.

## What every option needs anyway: a two-bot scheduler in the sim

Whichever way the scripts run, the sim changes the same way:

1. **Split `call` into submit and resolve.** `SimMatch.call(attr, method, args)` becomes, per bot,
   `submit(botId, action)` (validate, apply the instant part, start the drive command) plus a
   result that resolves at a known tick. Calls that cost 1 tick resolve next tick; `forward` with
   `wait=True` resolves when the move ends.
2. **Lockstep barrier.** The sim advances tick `t` to `t + 1` only when every live Python bot is
   blocked in a call (has an action in flight). Python computation between calls costs no sim
   time, exactly as today. So the result is a pure function of (level, both designs, both
   scripts, seed), whatever the CPU speed, and in whatever order the two bots' messages arrive.
3. **Fair resolution within a tick.** When both bots act on the same tick, sensor reads see the
   state at the start of the tick for both, and commands (fire, shield, drive) are applied
   together, not "slot 1 first". Otherwise the bot in slot 1 would always win a simultaneous shot.
   (The TypeScript enemy behaviours already issue these same commands, so they fit the same mould.)
4. **Frames and events per bot.** `Frame.bots` already lists every bot; `print` events need a
   `botId` so each console shows its own bot's output, and the HUD shows both bots' hull and
   energy.
5. **Ending.** One bot's script ending leaves it idle (as today); a script error or watchdog
   disables that bot (it stops and loses), and the match result names a winner instead of a star
   count.

Tick costs stay exactly as in `src/parts/api.ts`, so **fairness of tick costs** is the same for
every option: sim time comes only from API calls, never from wall time. A slow laptop or a heavy
loop between calls cannot cost a bot ticks. The only wall-time limit is the watchdog (3 s without a
call), which stops a bot, not the match.

## Options

### (a) Two workers in lockstep with SharedArrayBuffer and Atomics

Each bot gets its own worker and interpreter (today's worker, unchanged except the bridge). The
sim runs in a coordinator (the main thread or a third worker). A bot call writes the action into a
`SharedArrayBuffer`, notifies the coordinator and `Atomics.wait`s until the coordinator writes the
result back. The Python call stays synchronous.

- **Determinism**: yes, via the barrier above.
- **Isolation**: best. Each bot has its own interpreter and today's sandbox and `lockdown.ts`. The
  other player's code cannot see your bot's Python objects at all.
- **Memory**: two Pyodide instances (see measurements below: about +45 to +110 MB each).
- **Browser support**: `SharedArrayBuffer` needs a **cross-origin isolated** page (COOP + COEP
  response headers). GitHub Pages cannot set headers. The workaround is `coi-serviceworker`, a
  service worker that re-serves every response with the headers. Costs: a reload on the first visit
  (the service worker must control the page first); it fails where service workers are unavailable
  (some private-browsing modes); every cross-origin load must then be CORS or CORP-clean (the
  jsDelivr Pyodide CDN sends CORS headers, but anything else we add later must too); and it affects
  the whole app, not just the duel screen. Hosting elsewhere (Netlify, Cloudflare Pages) can set
  the headers directly.
- **Variant without isolation**: block on a synchronous `XMLHttpRequest` that a service worker
  answers when the coordinator has the result (the trick used by `sync-message` and some Pyodide
  consoles). It works without COOP/COEP, but every bot call becomes a fake network round trip
  (milliseconds each), still needs a service worker, and is fragile.

### (b) One interpreter, both scripts as coroutines

Run both scripts in today's single worker and interpreter, and switch between them at each bot call.

- **Source transform to generators**: rewrite every bot call into a `yield`. Any function that
  calls the bot, directly or indirectly, then becomes a generator, so every call to it needs
  `yield from`. That breaks methods, callbacks (`sorted(key=...)`), recursion and comprehensions,
  and the error messages and line numbers players see. Not viable for novice code.
- **greenlet**: not packaged for the pinned Pyodide (`loadPackage('greenlet')`: "No known package
  with name 'greenlet'").
- **JSPI stack switching** (`pyodide.ffi.run_sync`): each script runs under `runPythonAsync`; the
  bridge returns a Promise and the Python side calls `run_sync(promise)`, which suspends that
  script's whole stack (WebAssembly JavaScript Promise Integration) until the scheduler resolves
  it. This works with the pinned Pyodide (spike below): two scripts interleave correctly in one
  interpreter, even when suspended 20 frames deep.
  - **Determinism**: yes, via the barrier.
  - **Memory**: one interpreter, as today.
  - **Isolation: poor.** Both scripts share one interpreter, so one script can always reach the
    other's objects (`gc.get_objects()` found another namespace's bot in the spike), patch
    shared modules (`random`, `builtins`, `sys`), or install `sys.settrace` hooks that run inside
    the other bot's code. For a game against a stranger's shared bot that is a cheating channel we
    cannot close. Shared module state (`random`, `sys.stdout`) also has to be swapped at every
    switch, and a stuck loop in either script freezes both.
  - **Browser support**: needs JSPI (see the support table).

### (c) Two workers exchanging turns by postMessage

Each bot has its own worker and interpreter, as in (a). The sim runs in a coordinator on the main
thread. A bot call posts the action and the coordinator replies with the result when the barrier
lets that bot's action resolve.

The catch: Python's bot call is synchronous, and a worker cannot block waiting for a message
without `Atomics.wait` (option (a)). So (c) also needs JSPI inside each worker: the bridge returns
a Promise that the worker's `onmessage` resolves, and the Python side calls `run_sync` on it. With
that:

- **Determinism**: yes. Messages arrive in any order, but the coordinator only steps when both bots
  have submitted, and resolves the tick the same way each time. The order of arrival never reaches
  the sim.
- **Isolation**: as good as (a). Each bot has its own interpreter, its own sandbox and
  `lockdown.ts`; the worker keeps its private `postMessage` as today. The opponent's code can only
  affect the shared world through API calls.
- **Watchdog**: per worker, as today. A stuck bot is attributable to its own worker; kill it and the
  bot stops; the other bot carries on.
- **Memory**: two interpreters.
- **Speed**: one message round trip per call (plus a JSPI suspend). Calls are per action, not per
  tick, so even a bot that reads a sensor every tick for 3 minutes makes ~5,400 calls; at well
  under a millisecond each the run still finishes faster than playback needs.
- **Browser support**: needs JSPI, but **not** cross-origin isolation.

### (d) Record one bot's action trace and replay it

Run the shared bot alone (against an empty arena or a stand-in) and record its per-tick commands;
replay those commands in the duel. No sim or worker changes beyond a replay "behaviour".

- **Determinism**: yes, trivially.
- **Not interactive**: the replayed bot cannot react to you. Its radar never sees you, so it is a
  ghost, not an opponent. Fine for a "race the ghost" time trial; not a fight.
- **Isolation**: the stranger's script runs alone in today's sandbox. Or the trace is computed by
  its author and shared instead of the script.
- **Memory and support**: same as today.

### Also considered: opponent as a callback

Let the opponent be written as `def on_tick(bot): ...`, called synchronously by the sim each tick
from inside the current call. It works today with no new browser features, but the opponent's code
can no longer be a normal blocking script. It is a second API that novices would have to learn,
and the player could not take their own campaign bot into a fight. Rejected because the goal is no
API change.

## Measurements and spikes

What was actually run (Pyodide 314.0.7, the pinned version):

| spike | where | result |
|---|---|---|
| `can_run_sync()` at top level (`runPython`) | Node 22.23 (V8 12.4) | `False` with or without flags (expected: needs a promising entry point) |
| `run_sync` inside `runPythonAsync` | Node 22.23, no flag | `can_run_sync()` = `False`: no JSPI |
| same | Node 22.23, `--experimental-wasm-jspi` (or `--experimental-wasm-stack-switching`) | `True`, `run_sync(coroutine)` returned its value. `WebAssembly.Suspending` is not defined; Pyodide uses V8's older JSPI API there |
| two scripts in one interpreter, lockstep scheduler in JS, suspending 20 frames deep | Node 22.23 + flag | interleaved correctly: A got ticks 1, 2, 3 and B got ticks 1, 2, 3 |
| cost of a call | Node 22.23 + flag | plain synchronous bridge call ~3 µs; `run_sync` suspend + resume ~160 µs |
| `loadPackage('greenlet')` | Node 22.23 | "No known package with name 'greenlet'" |
| memory | Node 22.23 | wasm heap 30 MB per instance; RSS +107 MB for the first `loadPyodide`, +45 MB for a second in the same process; ~1.3 to 1.5 s to load each |
| another namespace's objects via `gc.get_objects()` | Node 22.23 | found the other "bot" and read its attributes |
| browsers (module worker, CDN Pyodide, same two-script test) | CI: Chromium, Firefox, WebKit via Playwright | BROWSER_RESULTS |

## Browser support for JSPI

BROWSER_TABLE

## Comparison

| | (a) SAB + Atomics | (b) one interpreter + JSPI | (c) two workers + JSPI | (d) replay |
|---|---|---|---|---|
| fights back (interactive) | yes | yes | yes | **no** |
| deterministic | yes | yes | yes | yes |
| fair tick costs | yes | yes | yes | n/a |
| other player's code isolated | yes | **no** | yes | yes |
| novice API change | none | none | none | none |
| memory | 2 interpreters | 1 | 2 | 1 |
| hosting on GitHub Pages | needs coi-serviceworker | as today | as today | as today |
| browsers | all with SAB | JSPI browsers | JSPI browsers | all |
| watchdog attributable to one bot | yes | partly (both freeze) | yes | n/a |
| work | high (sim scheduler, SAB protocol, COI) | medium (scheduler, per-script state swapping) | medium (scheduler, coordinator, async bridge) | low |

## Recommendation

**Option (c): two workers, one interpreter per bot, JSPI to block the bot call, the sim and the
lockstep scheduler on the main thread.** It keeps today's sandbox exactly as it is for each
bot, needs no cross-origin isolation (so it stays on plain GitHub Pages), is deterministic by
construction, and changes nothing for the novice. Single-player mode keeps today's fully
synchronous path, so nothing regresses where JSPI is missing; the duel mode is feature-detected
and shows "needs a recent Chrome, Edge or Firefox" elsewhere. If Safari support becomes a
requirement, (a) with coi-serviceworker can later replace the JSPI wait inside the same
two-worker design, because the coordinator and scheduler do not change.

(d) is a cheap extra, not an alternative: "race a friend's ghost" is a good warm-up mode that
needs almost none of the work above.

### Rough plan

1. **Sim**: split `call` into `submit` + scheduled resolution per bot; a `MatchOptions.players`
   list (each a `BotDesign`, spawn and team); simultaneous resolution within a tick; `botId` on
   print events; a duel result type (winner, reason). Keep the single-player `call()` as a thin
   wrapper so the campaign path and its tests are untouched. Unit-test determinism with two
   scripted TypeScript "players" (no Python needed).
2. **Runtime**: an async variant of the bridge (`call` returns a Promise; the generated `_call`
   does `run_sync(...)`). `bootstrap.py` stays the same otherwise. A `runDuelHeadless` for Node
   tests (Node 22 needs `--experimental-wasm-jspi` in the Vitest pool's `execArgv`; check whether
   Node 24 has it on by default before relying on that).
3. **Coordinator**: `DuelRunner` on the main thread: spawns two workers, runs the barrier, keeps
   a watchdog per worker, streams frames to `ArenaView` as `PythonRunner` does today.
4. **UI**: a "Duel" entry in Free play. Pick your bot (current design + script) and an opponent:
   a share URL / pasted link, or "player 2" with its own editor tab (hot seat). Show both
   consoles (tabs), both HUDs, the opponent's script read-only. Arena: a duel map or two without
   objectives, mirrored spawns.
5. **Tests**: headless duel determinism (same inputs give identical frames, in either message
   order); a Playwright duel smoke on Chromium; the mode hidden on WebKit.

## Open questions for the owner

1. **Browser reach**: is "Chrome, Edge and Firefox only" acceptable for the duel mode, or must it
   work in Safari too (which forces option (a) and coi-serviceworker)?
2. **Fairness of designs**: does a duel use a shared budget (weight and power limits per arena) so
   both bots are built under the same rules, and which parts are allowed?
3. **Opponent code visibility**: may you read the opponent's script before or after the fight?
   (Shared bots are visible today; hiding it would need the trace option or a server.)
4. **Seat and spawn fairness**: mirrored arenas only, or swap sides and run twice?
5. **Who is "the player" in the console and HUD** in hot seat, and how much UI is split vs shared?
6. **Scope of the first version**: duel against a share URL only, hot seat, or ghosts first?
7. **Win conditions**: last bot standing only, or also time-up on damage dealt / hp left?
