# Bot Arena

Build a robot from parts, program it in real Python, send it into arenas.

Bot Arena is a browser game that teaches Python to teen and adult beginners. Each level is a
small puzzle: pick a chassis, drive train, sensors and weapons in the Workshop, then write the
Python that drives your bot. The Python is real CPython (Pyodide, running in a Web Worker), so
everything you learn carries over to "proper" Python.

It is a static site: no server, no account. Progress is saved in your browser (IndexedDB), and
you can export it to a file or share a bot as a link.

## How to play

1. **Campaign** - pick the next open level and read the mission briefing. The "New in Python"
   box shows the idea the level teaches.
2. **Workshop** - drag parts from the bin onto the blueprint (or click a part, then a glowing
   slot). Stay inside the level's weight and power budget. The panel on the right lists the
   Python API your fitted parts give you, e.g. `bot.drive.forward(100)` or
   `bot.front_sensor.distance()`.
3. **Code & Arena** - write your script and press Run. Every bot call takes game time, so a
   normal `while True:` loop works. Use pause, step and ½×-4× speed to watch what happened;
   `print()` and `bot.log()` show up in the console with the game time.
4. Complete every objective to win. Two extra stars per level reward speed, care, short code or
   saving energy. Clearing a level opens the next one and unlocks new parts.

Stuck? Each level has up to three hints, and the API button opens a reference for your parts.
Free play lets you replay cleared levels with every part you have unlocked and no budget.

Units are centimetres; heading 0 is up and turns clockwise; a bearing is relative to where the
bot is facing, positive to the right.

## Development

Needs Node 22 and npm.

```sh
npm ci              # install
npm run dev         # dev server at http://localhost:5173/
npm run typecheck   # tsc --noEmit
npm test            # Vitest: sim, parts, save, python runtime, every level's reference solution
npm run build       # typecheck + production build into dist/
npm run preview:site # serve dist/ laid out like Pages: http://localhost:4173/bot-areana/main/
npm run test:e2e    # Playwright smoke: build a bot, run level 1, see the victory overlay
```

The headless tests run real Pyodide in Node (the `pyodide` npm package). The browser loads
Pyodide from the jsDelivr CDN, so the game needs a network connection on first load.

Playwright needs its browsers: `npx playwright install --with-deps chromium firefox webkit` (or run
one with `npm run test:e2e -- --project=chromium`). `npm run test:e2e` saves a picture of each screen
to `test-results/screens/<browser>/` (CI uploads them in the `playwright-report-<browser>` artifacts);
copy them from there to `docs/screenshots/` to refresh the docs. `tests/e2e/visual.spec.ts` also renders
the mockups in `docs/visual/` (`mockup-*.png`) beside the matching game screens (`game-*.png`).

Docs:

- [docs/design.md](docs/design.md) - the v1 game design (parts, levels, execution model).
- [docs/architecture.md](docs/architecture.md) - modules, contracts and data flow.
- [docs/visual/](docs/visual/) - the approved visual mockups.

Adding a level: copy one of `src/levels/lNN.ts`, add it to `src/levels/index.ts`, and write a
reference solution in `src/levels/solutions/`. `src/levels/levels.test.ts` checks that the
solution fits the budget and wins with at least one star.

## Deploying

GitHub Pages keeps every published version, each in its own folder of the `gh-pages` branch:

- `https://gilesknap.github.io/bot-areana/main/` - the latest `main`
- `https://gilesknap.github.io/bot-areana/v0.1.0/` - one folder per `v*` tag
- `https://gilesknap.github.io/bot-areana/` - redirects to the newest tag (or `main/` if there
  are none); `switcher.json` beside it lists every version for the in-game picker
  (**Settings -> Version**)

The CI workflow (`.github/workflows/ci.yml`) typechecks, runs the unit and level tests, builds
and runs the Playwright tests; then, on a push to `main` or of a `v*` tag, its `deploy` job builds
that commit and publishes it to its folder with `scripts/publish-pages.sh`. A deploy only replaces
its own folder and regenerates the root files (`scripts/pages-index.mjs`); it never removes other
versions. To delete a version, remove its folder from the `gh-pages` branch by hand.

The build uses a relative base (`./`), so it works from any folder. To publish a version made
before this workflow existed, run the workflow by hand (**Actions -> CI -> Run workflow**) with
`ref` set to the tag or the commit's full 40-character SHA (a short SHA is not found); it is built with the current workflow and published under the
`folder` input, or the ref's name if that is empty. For example:

```sh
gh workflow run ci.yml -f ref=v0.1.0
gh workflow run ci.yml -f ref=1d82ce64aa501c0cac951114d1a7224063b3f37a -f folder=v0.0.9
```

Only `main` and `v*` folders appear in the version picker.

One-time setup: in the repository's **Settings -> Pages**, set **Source** to **Deploy from a
branch**, branch **gh-pages**, folder **/ (root)**. The `gh-pages` branch is created by the first
deploy.

All versions share one save (IndexedDB is per origin). `SAVE_VERSION` in `src/save/data.ts`
versions its format: bump it on an incompatible change, and a version that does not understand
the stored save starts a fresh profile (with a console warning) instead of misreading it.
