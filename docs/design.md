# Bot Arena — v1 design

A 2D top-down browser game that teaches Python to teen/adult novices. Build a robot from parts,
program it in real Python, send it into arenas. Hosted statically on GitHub Pages.

## Stack
- TypeScript + Vite; Phaser 3 for rendering/input; CodeMirror 6 editor (Python highlighting,
  autocomplete for the fitted-part API).
- Pyodide (real CPython/WASM) in a Web Worker.
- Own fixed-step deterministic simulation, decoupled from rendering (headless-runnable, seeded RNG).
- The sim runs INSIDE the Python worker: each bot API call synchronously steps the sim until the
  action resolves, then returns. The worker streams frames/events to the main thread, which plays
  them back at the chosen speed (pause/step/½–4× are playback controls). No SharedArrayBuffer or
  cross-origin isolation needed; the headless Node runner uses the same code path.
- Future bot-vs-bot (two Python bots) will need a different scheduling design; out of scope for v1.
- GitHub Actions: test + build + deploy to Pages.
- Desktop only; narrow screens get a "best on a laptop" notice.

## Python execution model
- Blocking-style scripts: `while True: ...` reading like normal Python.
- Every API call costs simulated time (sensor read = 1 tick; movement lasts until complete).
- Non-blocking variants for advanced players: e.g. `bot.drive.forward(100, wait=False)`.
- Watchdog: script running too long without an API call (wall-clock, a few seconds) — main thread
  terminates the worker, keeps the frames so far, and shows a friendly error
  ("Your bot was thinking too hard — loops need to do something!").
- Visual reference: `docs/visual/*.dc.html` (exported from the design canvas
  https://claude.ai/artifact/RwNMze7XcPnawdyYG8NiHs). The arena rendering must match Arena.dc.html's
  "test hall" flair (steel plates, painted markings, shadowed walls, glowing lava, scorch/smoke,
  headlights, radar sweep, muzzle flash, glowing bolts, lock brackets, vignette), animated.
- Exceptions: shown in console, editor line highlighted, bot halts. Script ending → bot idles.
- `print()` / `bot.log()` go to an in-game console.
- Sandbox: block `js`, `pyodide.http`, and other network/DOM modules (shared-URL bots run others' code).

## Bot building
- Chassis S/M/L with slots: front, rear, left, right, centre. Larger chassis unlock later.
- Slot types: one drive train (locomotion); directional slots for sensors/weapons; side slots for
  armour/shields; core for battery.
- Each part has weight and power draw. Chassis max weight; battery = energy budget (slow recharge).
  Heavier bots are slower.
- Python API is generated from fitted parts: `bot.front_sensor.distance()`, `bot.blaster.fire()`.
  Only fitted parts exist on `bot`.
- Arena sprite is composed from chassis + fitted parts.
- Bots have HP.

## Part catalogue (v1)
- Locomotion (one per bot):
  - Wheels: medium speed, turns on the spot. `drive.forward(d)`, `.turn(deg)`, `.stop()`.
  - Tracks: slow, heavy, pushes others, ignores rough terrain.
  - Hover (late unlock): fast, momentum/drift, crosses water/pits.
- Sensors (directional):
  - Rangefinder: `distance()` along facing.
  - Radar: `scan()` → list of objects with `kind`, `bearing`, `distance`.
  - Compass/GPS: `position()` → tuple, `heading()`.
  - Bump sensor: `hit()` → bool.
- Offense: Blaster (projectile, cooldown, energy cost); Ram spike (collision damage);
  Mine dropper (later).
- Defense: Armour plate (reduces damage on that side, heavy); Shield generator (`shield.on()`,
  drains power).
- Core: Battery; Chassis S/M/L.
- Arena hazards: lava, pits, water, rough ground — interact with locomotion type.

## Enemies
- v1: TypeScript behaviours using the same parts/physics: patrol, chase, turret, kamikaze,
  coward (flees when hurt). Deterministic, tunable per level. Level brief describes behaviour.
- Architected so a Python-controlled bot can be an opponent later (future bot-vs-bot mode,
  loading shared bots).

## Game flow
- Campaign (main) + Free play (replay any cleared level with any bot).
- Screens: Workshop (build), Code (editor + API reference for fitted parts), Arena.
  Code and Arena side by side on wide screens.
- Run: play / pause / step tick / speed ½× 1× 2× 4×. No editing mid-run; ⟲ reset to re-run.
- Fixed seed per level → reproducible runs.
- Each level: mission-briefing style brief introducing its Python concept, starter script,
  up to 3 progressive hints, weight/power budget, parts unlocked on clear.
- Stars (1–3): completion; under par time; optional challenge (e.g. no damage, script < 15 lines).

## Campaign (v1)
| # | Level | Python concept | Goal | New part |
|---|---|---|---|---|
| 1 | First Steps | calling functions | drive to flag | Wheels |
| 2 | Corners | sequences, arguments | L-shaped corridor | — |
| 3 | Blind Spot | if/else, comparisons | flag past randomised walls | Rangefinder |
| 4 | Patrol Route | for loops, lists | visit 4 waypoints in order | Compass/GPS |
| 5 | Target Practice | while loops | destroy 5 static turrets | Blaster |
| 6 | Bump & Run | booleans, def | collect 3 data cores in a maze | Bump sensor |
| 7 | First Contact | iterating scan(), attributes | defeat a patrol bot | Radar, Armour |
| 8 | Rough Ground | variables & state | cross lava/rough ground, time limit | Tracks |
| 9 | Overcharge | resource management | survive 60 s vs 2 chasers | Shield, Battery+ |
| 10 | The Gauntlet | own functions/classes | defeat 3 mixed enemies | Ram spike, Hover |

## Persistence
- No backend. Auto-save progress, unlocks, bot designs, per-level scripts to IndexedDB.
- Multiple profiles per browser. Export/import save as .json.
- Share bot (design + script) as compressed URL hash.

## Look & sound
- Sleek "engineering sim": procedural vector art drawn in code (blueprint/neon on dark grid);
  parts are small drawing functions composed onto the chassis. Visual spec: Claude Design artifact.
- Procedural retro SFX (jsfxr-style); no music in v1; mute toggle.

## Quality
- Vitest: sim physics, damage, energy, per-call API costs.
- Every level ships a reference solution; CI runs it headless (sim + Pyodide in Node) and it must
  win with ≥1 star.
- Playwright smoke: load, build bot, run level 1, victory screen.
- Out of scope v1: accessibility beyond keyboard-navigable menus, i18n, accounts, leaderboards.
