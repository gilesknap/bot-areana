/**
 * Code & Arena: editor + console on the left, arena + HUD + run bar on the right. Arena.dc.html.
 *
 * A run: PythonRunner computes frames in the worker, ArenaView plays them back. Editing is
 * locked from the moment a run starts until Reset.
 */
import type { ScriptError } from '../shared/errors';
import type { Frame, LineRecord, SimEvent, WorldInit } from '../shared/frames';
import type { MatchResult } from '../shared/result';
import type { PlaybackSpeed } from '../shared/save';
import { formatTicks } from '../shared/script';
import { ArenaHud, ArenaView } from '../render';
import { createMatch } from '../sim';
import { sfx, sfxForEvent } from '../audio';
import { LEVELS } from '../levels';
import { recordResult } from '../save';
import { apiReference } from './apiRef';
import { unlockName } from './campaign';
import { levelTopbar, type Screen } from './chrome';
import { h, icon, pad2 } from './dom';
import { createEditor } from './editor';
import { getRunner } from './runner';
import { maybeTour } from './tour';
import { getDesign, getScript, setScript, type AppState, type LevelContext } from './state';
import { designIssues, issueText } from './workshopRules';

const SPEEDS: Array<{ value: PlaybackSpeed; label: string }> = [
  { value: 0.5, label: '½×' },
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
  { value: 4, label: '4×' },
];
const MAX_CONSOLE_LINES = 400;

const REASON_TEXT: Record<MatchResult['reason'], string> = {
  objectives_complete: 'All objectives complete.',
  bot_destroyed: 'Your bot was destroyed.',
  time_up: 'Out of time.',
  script_ended: 'Your script finished before the objectives were complete.',
  script_error: 'Your script stopped with an error.',
  watchdog: 'Your script got stuck in a loop.',
  aborted: 'The run was stopped.',
};

type Phase = 'idle' | 'running' | 'ended';

export function codeArenaScreen(state: AppState, ctx: LevelContext): Screen {
  const { level } = ctx;
  const design = getDesign(state, ctx);
  const runner = getRunner();

  // ---- Layout ----
  const hintsBtn = h('button.btn.small', { type: 'button' });
  const apiBtn = h('button.btn.small.api-btn', { type: 'button', 'aria-expanded': 'false' }, 'API');
  const hintPanel = h('div.hint-panel', { hidden: true, role: 'note' });
  const editorHost = h('div.editor-host');
  const apiDrawer = h('div.api-drawer', { hidden: true, role: 'region', 'aria-label': 'API reference' });
  const consoleOut = h('div.console-out', { role: 'log', 'aria-live': 'polite' });
  const arenaHost = h('div.arena-host');
  const hudHost = arenaHost;
  const overlay = h('div.result-overlay', { hidden: true });
  const status = h('div.arena-status', { hidden: true });
  const playBtn = h('button.run-btn.primary', { type: 'button', 'aria-label': 'Run' });
  const resetBtn = h('button.run-btn', { type: 'button', 'aria-label': 'Reset' }, icon('reset'));
  const stepBtn = h('button.run-btn', { type: 'button', 'aria-label': 'Step one line' }, icon('step'));
  const speedBtns = SPEEDS.map((s) => h('button', { type: 'button', 'aria-pressed': 'false' }, s.label));
  const readout = h('div.readout');
  const pyStatus = h('div.py-status', { role: 'status' });

  const el = h(
    'div.screen',
    {},
    levelTopbar(level, ctx.free, 'code', state),
    h(
      'div.code-body',
      {},
      h(
        'section.code-col',
        { 'aria-label': 'Code' },
        h('div.code-toolbar', {}, h('span.file-tab', {}, 'main.py'), h('div.spacer'), hintsBtn, apiBtn),
        hintPanel,
        h('div.editor-wrap', {}, editorHost, apiDrawer),
        h('div.console', {}, h('div.console-head', {}, 'CONSOLE'), consoleOut),
      ),
      h(
        'section.arena-col',
        { 'aria-label': 'Arena' },
        h('div.arena-wrap', {}, arenaHost, status, overlay),
        h(
          'div.runbar',
          {},
          resetBtn,
          playBtn,
          stepBtn,
          h('div.seg.speeds', { role: 'group', 'aria-label': 'Playback speed' }, ...speedBtns),
          h('div.spacer'),
          pyStatus,
          readout,
        ),
      ),
    ),
  );

  const editor = createEditor(editorHost, getScript(state, ctx), design, (text) => setScript(state, ctx, text));
  const arena = new ArenaView(arenaHost);
  apiDrawer.append(
    apiReference(design, (code) => {
      if (!editor.insert(code)) return log('Editing is locked during a run. Press reset (⟲) to edit.', 'sys');
      showApi(false);
    }),
  );

  // ---- Python status: booting in the background, never blocking ----
  function watchPython() {
    if (runner.booted) return setPyStatus('ready');
    setPyStatus('booting');
    const ready = runner.ready;
    ready.then(
      () => runner.ready === ready && setPyStatus('ready'),
      () => runner.ready === ready && setPyStatus('failed'),
    );
  }
  function setPyStatus(s: 'booting' | 'ready' | 'failed') {
    pyStatus.className = `py-status ${s}`;
    pyStatus.textContent = s === 'booting' ? 'PYTHON BOOTING…' : s === 'ready' ? 'PYTHON READY' : 'PYTHON OFFLINE';
    pyStatus.title = s === 'booting' ? 'Python is loading in the background. You can press Run now: it starts as soon as Python is up.' : '';
  }

  // ---- Console ----
  function log(text: string, kind: 'out' | 'err' | 'log' | 'tip' | 'sys' = 'out', tick?: number) {
    const line = h('div.console-line', { class: `c-${kind}` });
    if (tick !== undefined && kind !== 'err') line.append(h('span.c-time', {}, `[${formatTicks(tick)}] `));
    line.append(kind === 'err' && tick !== undefined ? `[${formatTicks(tick)}] ${text}` : text);
    consoleOut.append(line);
    while (consoleOut.childElementCount > MAX_CONSOLE_LINES) consoleOut.firstElementChild?.remove();
    consoleOut.scrollTop = consoleOut.scrollHeight;
  }

  // ---- HUD (render's ArenaHud, fed from playback) ----
  const hud = new ArenaHud(hudHost);

  function setReadout(tick: number) {
    readout.textContent = `T+ ${formatTicks(tick)} · TICK ${tick} · SEED ${String(seed).padStart(4, '0')}`;
  }

  // Levels with random walls get a new layout for every run (the preview shows the next one), so
  // the script has to look rather than remember. Other levels always use the level's seed.
  let seed = level.seed;
  let seedUsed = false;
  function nextSeed(): number {
    if (level.randomWalls && seedUsed) seed = Math.floor(Math.random() * 10000);
    seedUsed = false;
    return seed;
  }

  // ---- Run state ----
  let phase: Phase = 'idle';
  let playing = false;
  let run: { cancel(): void } | null = null;
  let pendingError: ScriptError | null = null;
  let result: MatchResult | null = null;
  /** Step started the run: step onto line 1 as soon as the first lines arrive. */
  let stepOnLines = false;

  function setPhase(p: Phase) {
    phase = p;
    editor.setReadOnly(p !== 'idle');
    el.classList.toggle('is-running', p !== 'idle');
  }

  function setPlaying(p: boolean) {
    playing = p;
    playBtn.replaceChildren(icon(p ? 'pause' : 'play'));
    playBtn.setAttribute('aria-label', p ? 'Pause' : phase === 'idle' ? 'Run' : 'Play');
  }

  function setSpeed(speed: PlaybackSpeed, persist = true) {
    arena.setSpeed(speed);
    speedBtns.forEach((b, i) => {
      const on = SPEEDS[i]!.value === speed;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    if (persist) {
      state.profile.settings.speed = speed;
      state.changed();
    }
  }

  function showError(err: ScriptError) {
    const where = err.line ? `Line ${err.line} · ` : '';
    log(`${where}${err.type}: ${err.friendly}`, 'err', err.tick);
    if (err.tip) log(err.tip, 'tip');
    editor.showError(err.line ?? null);
    pendingError = null;
  }

  /** Arena shows the level with the bot on its start pad, before any run. */
  function showPreview() {
    try {
      const match = createMatch({ level, design, seed: nextSeed(), scriptLines: 0 });
      void arena.load(level, match.world);
      hud.load(level, match.world);
      const frames = match.takeFrames();
      arena.push(frames);
      for (const f of frames) for (const e of f.events) hud.event(e);
    } catch (e) {
      console.warn('Arena preview unavailable', e);
    }
    setReadout(0);
  }

  async function startRun(startPaused = false) {
    const script = editor.getValue();
    const issues = designIssues(design, ctx.budget, ctx.unlocked);
    if (issues.length) {
      log(`Your bot can't go in yet: ${issues.map(issueText).join(' ')} Fix it in the Workshop.`, 'err');
      return;
    }
    setScript(state, ctx, script);
    state.flush();
    reset(false);
    stepOnLines = startPaused;
    consoleOut.replaceChildren();
    setPhase('running');
    setPlaying(!startPaused);
    if (!runner.booted) {
      status.hidden = false;
      status.textContent = 'Python is still booting… your run starts in a moment.';
    }
    try {
      await runner.ready;
    } catch (e) {
      status.textContent = `Python failed to load: ${(e as Error).message}`;
      setPhase('idle');
      setPlaying(false);
      return;
    }
    if (phase !== 'running') return; // reset while loading
    let started = false;
    const runSeed = nextSeed();
    seedUsed = true;
    run = runner.run(
      { level, design, script, seed: runSeed },
      {
        onStarted: (w: WorldInit) => {
          started = true;
          status.hidden = true;
          void arena.load(level, w);
          hud.load(level, w);
          if (playing) arena.play();
          else arena.pause();
        },
        onFrames: (frames: Frame[], lines: LineRecord[]) => {
          arena.push(frames, lines);
          if (stepOnLines && lines.length) {
            stepOnLines = false;
            if (!playing) arena.step();
          }
        },
        onFatal: (message: string) => {
          status.textContent = `Python failed to load: ${message}`;
          log(`Python failed to load: ${message}. Check your connection and reload.`, 'err');
          setPhase('idle');
          setPlaying(false);
        },
        onError: (err: ScriptError) => {
          pendingError = err;
          if (!started) showError(err); // e.g. a SyntaxError before the match starts
        },
        onDone: (r: MatchResult) => {
          result = r;
          run = null;
          watchPython(); // the worker restarts after a watchdog or crash
          if (!started) {
            // e.g. a SyntaxError: nothing to play back, so let them fix the line straight away.
            status.hidden = true;
            setPhase('idle');
            setPlaying(false);
            return;
          }
          arena.finish();
          if (!ctx.free) {
            const wasCleared = state.profile.levels[level.id]?.cleared;
            recordResult(state.profile, level.id, r.won, r.stars, r.seconds);
            if (r.won && !wasCleared) justCleared = true;
            state.changed();
          }
        },
      },
    );
  }

  let justCleared = false;

  /** Stop any run, rewind the arena to the preview and unlock the editor. */
  function reset(toPreview = true) {
    run?.cancel();
    run = null;
    result = null;
    pendingError = null;
    justCleared = false;
    stepOnLines = false;
    overlay.hidden = true;
    status.hidden = true;
    editor.showError(null);
    editor.showLine(null);
    arena.pause();
    setPhase('idle');
    setPlaying(false); // after setPhase: the button's label depends on the phase
    if (toPreview) {
      arena.reset();
      showPreview();
    }
    watchPython();
  }

  arena.onTick((tick: number, frame: Frame) => {
    setReadout(tick);
    hud.tick(tick, frame);
    if (pendingError && tick >= pendingError.tick) showError(pendingError);
  });
  arena.onEvent((e: SimEvent, tick: number) => {
    hud.event(e);
    if (e.type === 'print') log(e.text, e.stream === 'stderr' ? 'err' : e.stream === 'log' ? 'log' : 'out', tick);
    const s = sfxForEvent(e);
    if (s) sfx(s);
  });
  // A step playing up to its line shows Pause (pressing it stops there), and Play once it arrives.
  arena.onMoving((moving: boolean) => {
    if (phase !== 'idle') setPlaying(moving);
  });
  arena.onLine((line: number | null) => editor.showLine(phase === 'idle' ? null : line));
  arena.onEnd(() => {
    if (pendingError) showError(pendingError);
    setPlaying(false);
    setPhase('ended');
    if (result) showResult(result);
  });

  // ---- Result overlay ----
  function showResult(r: MatchResult) {
    const next = LEVELS.find((l) => l.number === level.number + 1);
    const starRow = (ok: boolean, label: string) => h('div.result-star', { class: ok ? 'earned' : '' }, h('span.star', {}, ok ? '★' : '☆'), label);
    overlay.replaceChildren(
      h(
        'div.result-card',
        { role: 'dialog', 'aria-label': r.won ? 'Victory' : 'Defeat' },
        h('div.eyebrow', { class: r.won ? 'signal' : 'alert' }, r.won ? 'MISSION COMPLETE' : 'MISSION FAILED'),
        h('h2', {}, r.won ? 'Victory' : 'Defeat'),
        h('div.result-stars', { 'aria-label': `${r.stars} of 3 stars` }, ...[1, 2, 3].map((n) => h('span', { class: r.stars >= n ? 'earned' : '' }, '★'))),
        h('p.muted', {}, REASON_TEXT[r.reason]),
        h(
          'div.result-rows',
          {},
          starRow(r.starFlags[0], level.objectives.map((o) => o.label).join(' · ')),
          starRow(r.starFlags[1], level.stars[0].label),
          starRow(r.starFlags[2], level.stars[1].label),
        ),
        h(
          'div.result-stats.mono',
          {},
          `TIME ${r.seconds.toFixed(1)} s · DAMAGE ${Math.round(r.damageTaken)} · ENERGY ${Math.round(r.energyLeft)}`,
        ),
        justCleared && next && next.unlocks.length > 0 &&
          h('div.result-unlock', {}, `Unlocked for level ${pad2(next.number)}: ${next.unlocks.map(unlockName).join(', ')}`),
        ctx.free && h('p.muted', {}, 'Free play: stars are not recorded.'),
        h(
          'div.result-actions',
          {},
          h('button.btn', { type: 'button', onclick: () => reset() }, 'Edit & retry'),
          h('a.btn', { href: `#/${ctx.free ? 'free' : 'level'}/${level.id}/workshop` }, 'Workshop'),
          r.won && !ctx.free && next
            ? h('a.cta.small', { href: `#/level/${next.id}` }, `Next level →`)
            : r.won && !ctx.free
              ? h('a.cta.small', { href: '#/' }, 'Campaign complete →')
              : null,
        ),
      ),
    );
    overlay.hidden = false;
    sfx(r.won ? 'victory' : 'defeat');
    (overlay.querySelector('.result-actions .cta, .result-actions button') as HTMLElement | null)?.focus();
  }

  // ---- Controls ----
  playBtn.addEventListener('click', () => {
    if (phase === 'idle') return void startRun();
    if (phase === 'ended') {
      // Play again after the end: a fresh run of the same script.
      return void startRun();
    }
    stepOnLines = false;
    setPlaying(!playing);
    if (playing) arena.play();
    else arena.pause();
  });
  stepBtn.addEventListener('click', () => {
    if (phase === 'idle') return void startRun(true);
    stepOnLines = false;
    setPlaying(false);
    arena.step(); // not pause() first: that would cancel a step still playing up to its line
  });
  resetBtn.addEventListener('click', () => reset());
  speedBtns.forEach((b, i) => b.addEventListener('click', () => setSpeed(SPEEDS[i]!.value)));
  editorHost.addEventListener('mousedown', () => {
    if (phase !== 'idle') log('Editing is locked during a run. Press reset (⟲) to edit.', 'sys');
  });

  // ---- Hints and API drawer ----
  const hints = level.hints;
  function renderHints(open: boolean) {
    const shown = Math.min(state.profile.hintsShown[level.id] ?? 0, hints.length);
    hintsBtn.hidden = hints.length === 0;
    hintsBtn.textContent = shown < hints.length ? `Hint ${shown + 1} of ${hints.length}` : `Hints ${shown}/${hints.length}`;
    hintPanel.hidden = !open || shown === 0;
    hintPanel.replaceChildren(
      ...hints.slice(0, shown).map((t, i) => h('div.hint', {}, h('span.cyan.mono', {}, `HINT ${i + 1} `), t)),
      h('button.icon-btn.hint-close', { type: 'button', 'aria-label': 'Hide hints', onclick: () => renderHints(false) }, icon('close')),
    );
  }
  hintsBtn.addEventListener('click', () => {
    const shown = state.profile.hintsShown[level.id] ?? 0;
    if (shown < hints.length && (shown === 0 || !hintPanel.hidden)) {
      state.profile.hintsShown[level.id] = shown + 1;
      state.changed();
    }
    renderHints(true);
  });
  function showApi(show: boolean) {
    apiDrawer.hidden = !show;
    apiBtn.setAttribute('aria-expanded', String(show));
    apiBtn.classList.toggle('active', show);
  }
  apiBtn.addEventListener('click', () => showApi(apiDrawer.hidden));

  // ---- Init ----
  renderHints(false);
  setPlaying(false);
  setSpeed(state.profile.settings.speed, false);
  showPreview();
  watchPython();
  const endTour = maybeTour(state, 'code', el, [
    { target: '.editor-wrap', title: 'Your script', text: 'This is main.py: real Python that drives your bot. It is saved as you type.' },
    { target: '.code-toolbar .api-btn', title: 'API reference', text: 'Every command your fitted parts give you, with examples. Click an example to put it in your script.' },
    { target: '.run-btn.primary', title: 'Run', text: 'Sends your bot into the arena. Python boots in the background, so you can press it straight away.' },
    { target: '.runbar .speeds', title: 'Watch it back', text: 'Pause, step through your script one line at a time (the line is lit up in the editor), or change speed. Reset (⟲) goes back to editing.' },
    { target: '.console', title: 'Console', text: 'Your print() output and friendly error messages appear here.' },
  ]);
  runner.ready.then(
    () => log('Python is ready. Press ▶ to run your script.', 'sys'),
    (e: Error) => log(`Python failed to load: ${e.message}. Check your connection and reload.`, 'err'),
  );
  log('Loading Python…', 'sys');

  return {
    el,
    destroy() {
      endTour();
      run?.cancel();
      hud.destroy();
      arena.destroy();
      editor.destroy();
    },
  };
}
