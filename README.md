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
npm run dev         # dev server at http://localhost:5173/bot-areana/
npm run typecheck   # tsc --noEmit
npm test            # Vitest: sim, parts, save, python runtime, every level's reference solution
npm run build       # typecheck + production build into dist/
npx vite preview    # serve dist/ at http://localhost:4173/bot-areana/
npm run test:e2e    # Playwright smoke: build a bot, run level 1, see the victory overlay
```

The headless tests run real Pyodide in Node (the `pyodide` npm package). The browser loads
Pyodide from the jsDelivr CDN, so the game needs a network connection on first load.

Playwright needs Chromium: `npx playwright install --with-deps chromium`. Run the smoke with
`SCREENSHOTS=1 npm run test:e2e` to save a picture of each screen to `docs/screenshots/`.

Docs:

- [docs/design.md](docs/design.md) - the v1 game design (parts, levels, execution model).
- [docs/architecture.md](docs/architecture.md) - modules, contracts and data flow.
- [docs/visual/](docs/visual/) - the approved visual mockups.

Adding a level: copy one of `src/levels/lNN.ts`, add it to `src/levels/index.ts`, and write a
reference solution in `src/levels/solutions/`. `src/levels/levels.test.ts` checks that the
solution fits the budget and wins with at least one star.

## Deploying

The site is built with Vite base path `/bot-areana/` and served from GitHub Pages at
`https://gilesknap.github.io/bot-areana/`. The CI workflow (`.github/workflows/ci.yml`)
typechecks, runs the unit and level tests, builds, runs the Playwright smoke, and on pushes to
`main` deploys `dist/` to Pages.

One-time setup: in the repository's **Settings -> Pages**, set **Source** to
**GitHub Actions**. If the repository is renamed, change `base` in `vite.config.ts` and
`baseURL` in `playwright.config.ts` to match.
