# Bot Arena — architecture (v1)

Companion to [design.md](design.md) (what we build) and `docs/visual/*.dc.html` (how it looks).
This file says where code lives, which module owns what, and the contracts between them.
The contracts are TypeScript in `src/shared/` and `src/parts/`; this document explains them.

## Stack and commands

TypeScript (strict) + Vite, Phaser 3 (arena), CodeMirror 6 (editor), Pyodide in a module Web Worker,
`idb` (IndexedDB), `lz-string` (share URLs), Vitest, Playwright. npm only.

| command | does |
|---|---|
| `npm run dev` | Vite dev server (`http://localhost:5173/`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest: unit tests + headless level-solution runs (Pyodide in Node) |
| `npm run build` | typecheck + `vite build` into `dist/` (relative base `./`, so it runs from any Pages folder) |
| `npm run preview:site` | serve `dist/` as Pages lays it out (`/bot-areana/main/`, `/bot-areana/v0.1.0/`, `switcher.json`) |
| `npm run test:e2e` | Playwright smoke, stuck-loop watchdog and version picker against `preview:site` (`-- --project=chromium` for one browser) |

CI (`.github/workflows/ci.yml`): typecheck, vitest, build, Playwright (every spec on Chromium,
the smoke spec on Firefox and WebKit, one job each in the Playwright container); on push to
`main` or a `v*` tag publishes the build to its own folder of the `gh-pages` branch (see the
README's Deploying section).

Pyodide is pinned once: `package.json` (`pyodide`, used by Node tests) and
`src/python/version.ts` (`PYODIDE_VERSION`, the browser loads the same version from
`https://cdn.jsdelivr.net/pyodide/v<version>/full/`). `version.test.ts` fails if they drift.
`package.json` is complete for v1; builders should not need to add dependencies.

## Module layout

```
src/
  main.ts        entry: startApp(#app)
  shared/        contracts only (types + tiny pure helpers). No module imports anything "upward" into shared.
  parts/         part + chassis catalogue, stats/validation, Python API spec, bot attribute naming
  sim/           deterministic engine: createMatch(): SimMatch
  python/        Pyodide runtime (shared by worker and Node), web worker, main-thread client, headless runner
  render/        Phaser arena scene + playback, procedural drawing, SVG part glyphs for the UI
  ui/            app shell/router, Campaign + briefing, Workshop, Code & Arena, console, run bar, dialogs
  save/          IndexedDB persistence, profiles, export/import JSON, share-URL encode/decode
  audio/         procedural jsfxr-style SFX + mute
  levels/        10 LevelDefs, unlock rules, reference solutions (.py) + headless levels test
tests/e2e/       Playwright smoke (all browsers), watchdog and version picker (Chromium)
```

Dependency direction (arrows = "imports"):

```
ui ──> render, python/client, save, audio, levels, parts, shared
       (+ sim's createMatch, only to draw the arena before the first run)
render ──> parts, shared            python ──> sim, parts, shared
levels ──> parts, shared (+ python/headless in levels.test.ts only)
sim ──> parts, shared               save, audio ──> shared
```

The Code & Arena screen (`ui/codeArena.ts`) is loaded with a dynamic `import()` from
`ui/app.ts`, so Phaser, CodeMirror, the sim and the Python client stay out of the main chunk
(Phaser has a chunk of its own, see `vite.config.ts`). Other screens may import
`render/glyphs` and `ui/highlight` (which parses with `@lezer/python` directly), but not
`render`'s index, `ui/editor` or `@codemirror/*`.

`sim` and `python/runtime` must not touch the DOM, Phaser, `Date.now()` or `Math.random()`
(they run in a worker and in Node, and must be deterministic).

## Conventions (src/shared/geometry.ts)

- The sim works in **world units**. A floor tile is `TILE_SIZE` = 40 units. The renderer draws
  1 unit = 1 px at scale 1 and fits the whole arena into its panel. A 22 x 19 tile map is 880 x 760.
- The player sees **cm**: `CM_PER_UNIT` = 1.25, so a floor plate (2 x 2 tiles, 80 units) is 100 cm
  and a tile is 50 cm. Only `Match.call` (the Python API boundary) converts, with `toCm`/`fromCm`:
  drive distances, rangefinder readings, radar `.distance`/`.x`/`.y` and gps positions are cm. Part
  stats shown to the player (Workshop meters, API docs) and level text are cm too; level data,
  part stats in the catalogue and frames stay in world units.
- Origin top-left, x right, **y down**.
- **Heading**: degrees, 0 = up, clockwise, [0, 360). **Bearing**: relative to the bot's facing,
  (-180, 180], positive = right, so `bot.drive.turn(t.bearing)` faces `t`.
- Sim tick rate `TICK_RATE` = 30 Hz. Floats returned to Python are rounded to 1 decimal place.

## Bots, parts and the Python API (src/parts/)

- `BotDesign = { chassis, drive, slots: { front?, rear?, left?, right?, centre? } }`.
  The drive train has its own mount (`drive`), not a slot.
- `CHASSIS` (S: front/rear/centre; M and L: all five slots; `turret_base` enemy-only) and `PARTS`
  hold every number (weight, power, speed, hp, energy, damage, ranges). Tune balance there only.
- `computeStats(design)` is the single source for weight, power, top speed (weight penalty:
  `topSpeed * clamp(refMass / weight, 0.5, 1)`), hp, energy capacity and recharge.
  `validateDesign(design, { budget, unlocked })` returns `DesignIssue[]` (empty = OK to run).
  Weight limit = min(chassis max, level budget); power limit = level budget.
- Terrain per drive is `PARTS[drive].drive.terrain` (rough slows wheels to 40%, tracks ignore it;
  lava burns 25 hp/s (hover 10); water blocks ground drives; pits destroy ground drives;
  hover crosses water and pits).
- Energy: `computeStats().energyCapacity`, recharging continuously at `recharge`/s. Drains:
  drive while moving (`energyPerSecond`), blaster shot, radar scan, shield per second.
  At 0 energy the drive limps at 25% speed, the shield drops, `fire()`/`shield.on()` raise
  `OutOfEnergy`.
- Damage: blaster bolt damage, ram damage scaled by impact speed / top speed. Hits are
  assigned a side (front/right/rear/left by impact angle, 90 degree sectors); an armour plate on
  that side multiplies by `1 - reduction`; an active shield then multiplies by `1 - 0.8`.

### Python attribute naming (`src/parts/naming.ts`)

| fitted | Python |
|---|---|
| drive train (wheels/tracks/hover) | `bot.drive` |
| Radar, Compass/GPS, Blaster, Shield gen | `bot.radar`, `bot.gps`, `bot.blaster`, `bot.shield` (one per bot) |
| Battery / Battery+ (centre) | `bot.battery` |
| Rangefinder in slot S | `bot.<S>_sensor` (`front_sensor`, `left_sensor`, ...) |
| Bump sensor in slot S | `bot.<S>_bumper` |
| Armour, Ram spike | passive, no attribute |
| always present | `bot.log(*values)`, `bot.wait(seconds)`, `bot.health()`, `bot.time()` |

`fittedApi(design)` lists the attributes; `botApi(design)` pairs them with their `PartApi`
(core first, attr `''`); `signature(method)` renders `forward(distance, wait=True)`.

### API spec (`src/parts/api.ts`)

Each `ApiMethod` has params (type, default as a Python literal, doc), return type, summary,
doc, `ticks` cost, energy, `raises`, example. Tick costs:

- sensors and queries (`distance`, `scan`, `position`, `hit`, `ready`, `level`, `health`, `time`, ...): 1 tick
- `blaster.fire`, `shield.on/off`, `drive.stop`: 1 tick
- `drive.forward/backward/turn`: until done (`wait=True`), else 1 tick and the move continues;
  a new drive command replaces the current one. `forward` returns cm actually moved (blocked =
  no progress for 10 ticks ends the move).
- `bot.wait(s)`: `max(1, round(s * 30))` ticks. `bot.log`: 0 ticks (handled in Python, not the sim).

Game exceptions (`BOT_ERRORS` in `src/shared/errors.ts`): `BlasterNotReady`, `OutOfEnergy`,
`PartNotFitted`; all subclass `BotError(Exception)` and are visible to scripts by name.

## Execution model and data flow

```
 main thread                                   worker (or Node in tests)
 ───────────                                   ─────────────────────────
 ui ──run{level,design,script,seed}──► python/worker.ts ─► python/runtime.ts
                                                            │ builds `bot` from botApi(design)
                                                            │ exec(script)
                                                            │   bot.drive.forward(100)
                                                            │     └─► match.call('drive','forward',[100,true])
                                                            │            sim steps N ticks, returns
                                                            │ every ≥50 ms wall: takeFrames() ─┐
 ◄────────────────── started{world}, frames[], error, done{result} ◄────────────────────────────┘
 render (ArenaView) buffers frames and plays them back at ½–4x;
 playback emits SimEvents → console (print), audio, HUD.
```

1. `ui` asks `PythonRunner.run(req, handlers)` (`src/python/client.ts`).
2. Worker: `createMatch({ level, design, seed, scriptLines })` from `src/sim`, posts `started{world}`.
3. `runtime.ts` builds the `bot` object from the spec and runs the script. Each method call applies
   Python defaults and calls `match.call(attr, method, args)` which steps the sim synchronously
   until the action resolves and returns a `PyValue` (tuples arrive as 2-element arrays, scan
   results as plain objects the runtime wraps with attribute access).
4. `print()` and `bot.log()` call `match.print(text, stream)`: a `print` SimEvent at the current
   tick, so console output appears in sync with playback.
5. Script ends → `match.finish()` (bot idles; enemies keep going until the match ends).
   Exception → runtime posts `error{ScriptError}` (line in the player's script, tick, friendly text)
   then `match.abort('script_error')`. `MatchOver` thrown from `call()` (won / destroyed / time up
   mid-script) becomes an uncatchable `BaseException` in Python and ends the script quietly.
6. Worker posts remaining `frames` then `done{result}`.
7. **Watchdog** (client): after `started`, if the worker sends nothing for 3 s wall time, terminate
   it, report `ScriptError{type:'Watchdog', friendly: WATCHDOG_MESSAGE}` at the last tick
   received, synthesize a lost `MatchResult` (`reason:'watchdog'`), keep the frames so far, and
   switch to the spare worker (below). The worker flushes frames at least every ~50 ms while calls happen, so
   only call-free loops trip it. Per-tick print events are capped (~200) to bound memory.
8. Pause / step / speed / reset are playback controls on the already-computed frames. No editing
   mid-run; reset discards the run.
9. **Line records**: `bootstrap.py` records each line of `main.py` as it starts (`sys.monitoring`
   LINE events on main.py's code objects only) and hands them over with the next bot call, or at
   the end of the script; the runtime stamps them with the current tick (`LineRecord`) and sends
   them with the frames. At most 100 are kept between two calls (the first ones; past the cap
   the last slot is set to the line making the call, or the line that raised), so a long loop that never calls the bot
   neither grows memory nor stays slowed down. Step mode
   walks these lines and the editor highlights the current one.

### Worker protocol (`src/shared/protocol.ts`)

`MainToWorker`: `{ type:'run', runId, level, design, script, seed }`.
`WorkerToMain`: `ready{pyodideVersion}`, `fatal{message}`, `started{runId, world}`,
`frames{runId, frames, lines}`, `error{runId, error}`, `done{runId, result}`.
One run at a time per worker; each run gets a fresh Python namespace. Messages for a stale
`runId` are ignored by the client.

### Sim contract (`SimMatch`, `CreateMatch`)

`src/sim/index.ts` exports `createMatch: CreateMatch`. Requirements:

- Pure TS, deterministic: all randomness from a seeded PRNG (e.g. mulberry32(seed)); same
  inputs → identical frames. `randomWalls` resolved from the seed.
- One `Frame` per tick, starting with tick 0 (initial state) which also carries an `objective`
  event per objective so the HUD can initialise. `Frame.bots` lists every bot every tick.
- Ends the match when: all objectives done (`objectives_complete`, won); player hp 0 or fell
  into a pit (`bot_destroyed`); clock passes `timeLimit` or `MAX_MATCH_SECONDS` (`time_up`).
  A `survive` objective completes when its time is reached.
- `result()` fills `MatchResult`: stars = 0 if lost, else 1 + each `LevelDef.stars` criterion met
  (`time` ≤ seconds, `damage` taken ≤ max, `lines` ≤ max using `MatchOptions.scriptLines`,
  `energy` left ≥ min).
- Enemies are bots with a `BotDesign` and a TS behaviour: `static` (target dummy),
  `turret` (pivot + blaster; tracks and fires at the player within `fireRange`),
  `patrol` (loops `route`, engages when the player is within `sightRange`),
  `chase`, `kamikaze` (rams, self-destructs with a large explosion), `coward` (fights, flees
  below `fleeBelow` hp). Behaviours issue the same drive/blaster/shield commands the player's
  API uses so a Python opponent can slot in later.
- SimEvents for the renderer/audio: `muzzle_flash`, `hit`, `explosion`, `destroyed`, `scan`
  (radar sweep), `range` (rangefinder ping), `bump`, `shield`, `hazard`, `marker`
  (waypoint reached / core collected / flag reached), `objective` (progress), `print`, `low_energy`.
- Events and prints caused by a call land in the next frame (tick + 1).
- `WorldInit.walls` does not include the automatic arena edge walls (they sit just outside
  `0..width` / `0..height`); the renderer draws the hall edge itself.
- Marker ids: a flag uses its objective id; waypoints and cores use `'<objectiveId>.<n>'`
  (n counts from 1) with `index` set. Marker events use the same ids.
- `MatchResult.energyLeft` and the `energy` star criterion's `min` are percent of capacity
  (0-100), the same scale as `battery.level()`.
- `BehaviourParams.fireDelay` is extra seconds on top of the blaster's 1 s cooldown.
- Bolts pass through bots on the shooter's own team; a kamikaze blast only hurts the other team.

### Python runtime (`src/python/`)

- `version.ts`: `PYODIDE_VERSION`, `PYODIDE_CDN`.
- `runtime.ts`: environment-agnostic. Given a loaded `PyodideAPI`, a `SimMatch`, the design and
  script: builds the `bot` object (one Python class per fitted attr, generated from `botApi`),
  installs `print` capture, the `BotError` hierarchy, seeds `random` with the run seed, runs the
  script compiled as `main.py`, and maps exceptions to `ScriptError` (line = last traceback frame in
  `main.py`; friendly text for SyntaxError, IndentationError, NameError, TypeError,
  AttributeError, ZeroDivisionError, game errors, ...). Takes a `flush(frames)` callback.
- Sandbox: block importing `js`, `pyodide`, `pyodide_js`, `_pyodide`, `pyodide.ffi`,
  `pyodide.http`, `micropip`, `socket`, `urllib`, `http`, `ssl`, `subprocess`, and hide the
  bridge object from the player's namespace. Shared-URL bots run strangers' code. Python in
  Pyodide can always find its way back to JavaScript, so the real boundary is `lockdown.ts`: once
  Pyodide has loaded, the worker removes network, storage, nested workers, `postMessage` (kept
  privately) and every way to compile code (`eval`, `Function` constructors, string timers).
- `worker.ts`: module worker; `import(PYODIDE_CDN + 'pyodide.mjs')`, `loadPyodide({ indexURL: PYODIDE_CDN })`,
  posts `ready`, handles `run`.
- `client.ts` (main thread): `class PythonRunner { ready: Promise<void>; run(req, handlers): { cancel() }; dispose() }`
  with the watchdog; handlers `onStarted(world)`, `onFrames(frames, lines)`, `onError(err)`, `onDone(result)`,
  and optional `onFatal(message)` (Python could not load, or the worker failed mid-run).
  Stopping a script (cancel, watchdog, crash) means terminating its worker, so the runner keeps
  one spare worker booting in the background, started when a run is posted or a worker is
  killed; the spare takes over at once and Retry doesn't wait for Python again.
- `headless.ts` (Node, tests only): `runHeadless(req: RunRequest): Promise<{ world, frames, lines, result, error?, prints: string[] }>`
  using the `pyodide` npm package (instance cached across calls) and the same `runtime.ts`.
  An optional second argument `{ createMatch?, watchdogMs? }` swaps the sim (tests) or the
  in-Python watchdog. `runMatchHeadless(level, design, script, seed?)` is the shortcut the
  level tests use.

### Render (`src/render/`)

- `ArenaView` (Phaser): `constructor(parent)`, `load(level, world)`, `push(frames, lines?)`,
  `play()`, `pause()`, `step()`, `setSpeed(PlaybackSpeed)`, `reset()`, `destroy()`, and listeners
  `onTick(cb(tick, frame))`, `onEvent(cb(event, tick))` (fired as playback reaches each event),
  `onLine(cb(line | null))` (the script line shown changed), `onMoving(cb(moving))` (playback
  started or stopped moving: playing, or a step playing up to its line; the UI's Play/Pause
  button follows it), `onEnd(cb)` (playback reached the last frame of a finished run and every
  line up to it, so the result never covers lines still to step through). `step()` moves to the
  next line record: at once if it starts at the shown tick (lines that take no game time share a
  tick), else by playing at the current speed until that tick and pausing there. After the last
  line of a finished run the end of the run is the last step: it plays to the last frame. A second
  `step()` meanwhile finishes it at once; `pause()` stops it where it is, `play()` carries on
  playing. While frames are still streaming and no next line has arrived (or with no lines at
  all, as in `render/demo.ts`) it steps one tick. Playback interpolates between ticks for smooth
  motion. Also `finish()` (no more frames are coming for this run, so `onEnd` may fire) and
  `rewind()` (replay from tick 0 keeping the frames), plus `playing`, `moving`, `line`, `speed`,
  `tick` and `bufferedTick` getters. `PlaybackClock.ended` is true once the end has been signalled
  (`play()` then replays from the start). The editor's current line follows steps and pauses, not
  normal play. A script error shows when playback ends (an error ends the match).
- Look must match `Arena.dc.html` "test hall": steel floor plates with rivets, painted hazard
  border and centre ring, level label (`LevelDef.label`) as a faint giant stencil, START hex pad,
  concrete walls with hazard-stripe ends and drop shadows, glowing lava, water, pits, rough
  ground, scorch marks + smoke + wreck debris where things die, headlight beam on the player,
  radar sweep on `scan`, muzzle flash, glowing bolts with trails, LOCK brackets + distance on the
  enemy the player's blaster points at, vignette. Animated (lava glow and upwellings, sweep, smoke,
  corner lights, dust motes). With software WebGL (no GPU, e.g. headless CI) the browser reads
  each WebGL frame back on the main thread, so there the hall is still while idle: the Phaser
  loop sleeps unless playing, and draws once after each change. The canvas has `devicePixelRatio` pixels per CSS pixel (crisp on HiDPI).
  The HUD overlay (HULL / ENERGY bars, objective counter) is DOM: `ArenaHud` in `render/hud.ts`,
  fed by the UI from `onTick` / `onEvent`.
- `glyphs.ts`: SVG strings for the UI, matching Main.dc.html: `partGlyphSvg(partId | chassisId, size?)`,
  `botSvg(design, { team })` (composed top-down bot), tile/marker swatches.

### UI (`src/ui/`)

Hash router (works on GitHub Pages): `#/` campaign, `#/level/<id>` briefing,
`#/level/<id>/workshop`, `#/level/<id>/code`, `#/free`, `#/free/<id>/workshop`, `#/free/<id>/code`,
`#/share/<payload>`. Free-play scripts are saved under `'free:<levelId>'`, the design under `'free'`.
Screens follow Campaign.dc.html, Workshop.dc.html and Arena.dc.html exactly (64 px top bar,
fonts, colours from `src/shared/palette.ts` / CSS variables in `ui/styles.css`). Code & Arena:
CodeMirror 6 with Python highlighting in the mockup colours, autocomplete from `botApi(design)`,
error line highlight, API reference drawer (generated from `botApi(design)`: signatures, docs, tick
costs, an example per method that click-inserts into the script), hints (`hintsShown`), console with
`[mm:ss.t]` prefixes (`formatTicks`), run bar (reset, play/pause, step, ½× 1× 2× 4×, Python boot
status, `T+ · TICK · SEED`), result dialog with stars. The app starts the one Python worker
(`ui/runner.ts`) at start-up, so Pyodide boots in the background while the player reads the briefing
and builds. A short guided tour (`ui/tour.ts`) shows the first time a profile reaches the Workshop and
Code & Arena (`Profile.toursSeen`). Narrow screens (< 1024 px) show a "best on a laptop" notice. Keyboard-navigable menus.

### Save (`src/save/`)

`loadSave(): Promise<SaveData>` (creates a default profile), `saveSave(data)`, profile helpers
(create / rename / delete / switch), `exportSave(data): string`, `importSave(json): SaveData`
(validates, throws a friendly error), `encodeShare(p: SharePayload): string`,
`decodeShare(s): SharePayload | null` (lz-string `compressToEncodedURIComponent`), and a pure
in-memory fallback when IndexedDB is unavailable. `SaveData.version` must equal `SAVE_VERSION`;
every published version shares the one per-origin save, so a stored save in another format is
ignored (console warning, fresh profile) and an imported one is refused. The UI auto-saves (debounced) on design,
script and progress changes.

### Audio (`src/audio/`)

`sfx(name: SfxName)`, `setMuted(b)`, `isMuted()`, `sfxForEvent(e: SimEvent): SfxName | null`,
`unlockAudioOnGesture()`. `SfxName` lives in `audio/sfx.ts` (includes `enemy_blaster`,
`big_explosion`, `shield_on` / `shield_off`, `low_energy`, `victory`, `defeat`).
Procedural (WebAudio oscillators + noise, jsfxr-style), lazy AudioContext on first user gesture,
no assets, no music.

### Levels (`src/levels/`)

- One file per level (`l01.ts`..`l10.ts`); `common.ts` holds the shared enemy designs
  (`ENEMY`) and the `tile()` helper.
- `index.ts`: `LEVELS: LevelDef[]` (`l01`..`l10`, design.md campaign table),
  `getLevel(id)`, `isPlayable(profile, id)` (level 1, or the previous level cleared),
  `unlockedFor(profile): Set<UnlockId>` = union of `unlocks` of every playable level.
- Unlocks (available from that level on): l01 `chassis_s`, `wheels` · l03 `rangefinder` ·
  l04 `gps` · l05 `blaster`, `battery`, `chassis_m` · l06 `bump` · l07 `radar`, `armour`, `chassis_l` ·
  l08 `tracks` · l09 `shield`, `battery_plus` · l10 `ram`, `hover`.
- Each level: map, spawn, objectives, enemies, budget, two star criteria, seed, starter script,
  up to 3 hints, brief + lesson box, and `solution: { design, script: 'solutions/lNN.py' }`.
- `levels.test.ts`: for every level, the solution design passes `validateDesign` with the level
  budget and the parts unlocked by then, and `runHeadless` with the level seed wins with ≥ 1 star.
  Level 3 (randomised walls) also runs a few other seeds.

## Testing

- Vitest (`src/**/*.test.ts`, Node): sim physics, damage, energy, per-call tick costs, objectives,
  determinism (same seed → same frames); parts stats; save/share round-trips (`fake-indexeddb`);
  python runtime (sandbox, error mapping) and all level solutions headless.
- Playwright (`tests/e2e/`): load, build a bot, run level 1, see the victory screen; run
  `while True: pass`, see the 'thinking too hard' message, then re-run successfully.
