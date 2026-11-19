/** App shell: load the save, route between screens, handle share links. */
import type { SharePayload } from '../shared/save';
import { CHASSIS, PARTS } from '../parts/catalogue';
import { LEVELS, getLevel, isPlayable } from '../levels';
import { decodeShare, loadSave } from '../save';
import { unlockAudioOnGesture } from '../audio';
import { campaignScreen, freePlayScreen } from './campaign';
import { openDialog, type Screen } from './chrome';
import { h, pad2, toast } from './dom';
import { highlightPython } from './highlight';
import { navigate, parseRoute, type Route } from './router';
import { AppState, levelContext, type LevelContext } from './state';
import { workshopScreen } from './workshop';

const NARROW_KEY = 'bot-arena:narrow-dismissed';

export async function startApp(root: HTMLElement): Promise<void> {
  root.replaceChildren(h('div.boot', {}, h('span.brand', {}, 'BOT ARENA'), h('span.muted.mono', {}, 'LOADING…')));
  unlockAudioOnGesture();
  const state = new AppState(await loadSave());
  let current: Screen | null = null;
  let generation = 0;

  const render = async () => {
    const mine = ++generation;
    current?.destroy?.();
    current = null;
    const next = await buildScreen(state, parseRoute(location.hash), render);
    if (mine !== generation) {
      next.destroy?.(); // the route changed again while the screen was loading
      return;
    }
    current = next;
    root.replaceChildren(current.el, narrowNotice());
    window.scrollTo(0, 0);
  };
  window.addEventListener('hashchange', () => void render());
  await render();
}

/** The Code & Arena screen (Phaser, CodeMirror, the sim) is its own chunk, loaded on first use. */
async function codeArenaScreen(state: AppState, ctx: LevelContext): Promise<Screen> {
  const screen = await import('./codeArena');
  return screen.codeArenaScreen(state, ctx);
}

function buildScreen(state: AppState, route: Route, rerender: () => void): Screen | Promise<Screen> {
  switch (route.name) {
    case 'campaign':
      return campaignScreen(state, route.levelId, rerender);
    case 'free':
      return freePlayScreen(state, rerender);
    case 'share':
      // Show the campaign underneath and offer to load the shared bot.
      queueMicrotask(() => offerSharedBot(state, route.payload));
      return campaignScreen(state, undefined, rerender);
    case 'workshop':
    case 'code': {
      const ctx = levelContext(state, route.levelId, route.free);
      const allowed =
        ctx && (route.free ? state.profile.levels[ctx.level.id]?.cleared : isPlayable(state.profile, ctx.level.id));
      if (!ctx || !allowed) {
        queueMicrotask(() => {
          toast(ctx ? "That level isn't open yet." : 'No such level.', 'error');
          navigate({ name: 'campaign' }, true);
        });
        return campaignScreen(state, undefined, rerender);
      }
      return route.name === 'workshop' ? workshopScreen(state, ctx) : codeArenaScreen(state, ctx);
    }
  }
}

function describeDesign(p: SharePayload): string {
  const parts = Object.entries(p.design.slots).map(([slot, part]) => `${PARTS[part!].name} (${slot})`);
  return [CHASSIS[p.design.chassis].name, p.design.drive ? PARTS[p.design.drive].name : 'no drive', ...parts].join(' · ');
}

function offerSharedBot(state: AppState, payload: string): void {
  const shared = decodeShare(payload);
  if (!shared) {
    toast('That share link is damaged or incomplete.', 'error');
    navigate({ name: 'campaign' }, true);
    return;
  }
  const profile = state.profile;
  const named = shared.level ? getLevel(shared.level) : undefined;
  const target = named && isPlayable(profile, named.id) ? named : LEVELS.filter((l) => isPlayable(profile, l.id)).pop() ?? LEVELS[0]!;
  const freeOk = named && profile.levels[named.id]?.cleared;

  const load = (free: boolean) => {
    const level = free ? named! : target;
    const ctx = levelContext(state, level.id, free)!;
    profile.designs[ctx.designKey] = shared.design;
    profile.scripts[ctx.scriptKey] = shared.script;
    state.changed();
    dialog.close();
    navigate({ name: 'workshop', levelId: level.id, free });
  };

  const dialog = openDialog(
    'Shared bot',
    h(
      'div.share-body',
      {},
      h('p', {}, h('strong', {}, shared.name ?? 'A shared bot'), named ? ` · built for level ${pad2(named.number)} · ${named.title}` : ''),
      h('p.muted', {}, describeDesign(shared)),
      h('pre.share-script', {}, highlightPython(shared.script)),
      h('p.muted', {}, 'Loading it replaces your saved design and script for that level.'),
      h(
        'div.row',
        {},
        freeOk && h('button.btn', { type: 'button', onclick: () => load(true) }, `Try in free play · level ${pad2(named!.number)}`),
        h('button.cta.small', { type: 'button', onclick: () => load(false) }, `Load into level ${pad2(target.number)}`),
      ),
    ),
    { wide: true, onClose: () => location.hash.startsWith('#/share/') && navigate({ name: 'campaign' }, true) },
  );
}

/** Desktop-first: a dismissible notice on narrow screens. */
function narrowNotice(): HTMLElement {
  let dismissed = false;
  try {
    dismissed = sessionStorage.getItem(NARROW_KEY) === '1';
  } catch {
    // storage blocked: just show it
  }
  const el = h(
    'div.narrow-notice',
    { role: 'note', hidden: dismissed },
    h('span', {}, 'Bot Arena is best on a laptop or desktop: the code editor and arena need room side by side.'),
    h('button.btn.small', {
      type: 'button',
      onclick: () => {
        el.hidden = true;
        try {
          sessionStorage.setItem(NARROW_KEY, '1');
        } catch {
          // ignore
        }
      },
    }, 'OK'),
  );
  return el;
}
