/** Campaign screen (level grid + mission briefing) and the Free play picker. Campaign.dc.html. */
import type { LevelDef } from '../shared/level';
import type { ChassisId, PartId, UnlockId } from '../shared/parts';
import { CATEGORY_COLOUR, CHASSIS, PARTS } from '../parts/catalogue';
import { LEVELS, isPlayable } from '../levels';
import { brand, openSettings, type Screen } from './chrome';
import { h, icon, pad2, starString } from './dom';
import { highlightPython } from './highlight';
import { navigate } from './router';
import type { AppState } from './state';

type CardState = 'cleared' | 'next' | 'locked';

function cardState(state: AppState, level: LevelDef): CardState {
  if (state.profile.levels[level.id]?.cleared) return 'cleared';
  return isPlayable(state.profile, level.id) ? 'next' : 'locked';
}

export function unlockName(id: UnlockId): string {
  return id in CHASSIS ? CHASSIS[id as ChassisId].name : PARTS[id as PartId].name;
}

export function unlockColour(id: UnlockId): string {
  return id in CHASSIS ? 'var(--cyan)' : CATEGORY_COLOUR[PARTS[id as PartId].category];
}

function campaignTopbar(state: AppState, rerender: () => void): HTMLElement {
  const settings = () => openSettings(state, rerender);
  return h(
    'header.topbar',
    {},
    brand(),
    h('div.spacer'),
    h(
      'button.profile-chip',
      { type: 'button', onclick: settings, title: 'Switch profile' },
      `PROFILE · ${state.profile.name.toUpperCase()} · ★ ${state.totalStars()} / ${LEVELS.length * 3}`,
    ),
    h('a.btn', { href: '#/free' }, 'Free play'),
    h('button.icon-btn.square', { type: 'button', 'aria-label': 'Settings', onclick: settings }, icon('gear')),
  );
}

function levelCard(level: LevelDef, st: CardState, stars: number, selected: boolean, onPick: () => void): HTMLElement {
  return h(
    'button.level-card',
    {
      type: 'button',
      class: `${st}${selected ? ' selected' : ''}`,
      'aria-pressed': selected ? 'true' : 'false',
      'aria-label': `Level ${level.number}: ${level.title}, ${st}`,
      onclick: onPick,
    },
    h('div.level-card-top', {}, h('span.level-num', {}, pad2(level.number)), h('span.level-stars', {}, st === 'cleared' ? starString(stars) : '')),
    h('div.level-title', {}, level.title),
    h('div.level-concept', {}, level.concept),
  );
}

function briefing(state: AppState, level: LevelDef, st: CardState): HTMLElement {
  const best = state.profile.levels[level.id]?.bestStars ?? 0;
  const star = (n: number) => h('span.star', { class: best >= n ? 'earned' : '' }, best >= n ? '★' : '☆');
  const objectives = level.objectives.map((o) => o.label).join(' · ');
  const cta =
    st === 'locked'
      ? h('div.cta.disabled', { 'aria-disabled': 'true' }, icon('lock'), ` Clear level ${pad2(level.number - 1)} to unlock`)
      : h('a.cta', { href: `#/level/${level.id}/workshop` }, 'Build your bot →');
  return h(
    'aside.briefing',
    { 'aria-label': 'Mission briefing' },
    h('div.eyebrow.amber', {}, `MISSION BRIEFING · ${pad2(level.number)}`),
    h('h2.briefing-title', {}, level.title),
    ...level.brief.split(/\n\s*\n/).map((p) => h('p.brief', {}, p)),
    h(
      'div.lesson',
      {},
      h('div.eyebrow.cyan', {}, `NEW IN PYTHON · ${level.lesson.title}`),
      h('pre.lesson-code', {}, highlightPython(level.lesson.snippet)),
      h('div.lesson-blurb', {}, level.lesson.blurb),
    ),
    h(
      'div.objectives',
      {},
      h('div.eyebrow', {}, 'OBJECTIVES'),
      h('div.objective', {}, star(1), objectives),
      h('div.objective', {}, star(2), level.stars[0].label),
      h('div.objective', {}, star(3), level.stars[1].label),
    ),
    h(
      'div.chips',
      {},
      h('span.chip', {}, `BUDGET ${level.budget.weight} KG · ${level.budget.power} W`),
      level.unlocks.length > 0 &&
        h(
          'span.chip',
          { style: `color: ${unlockColour(level.unlocks[0]!)}; border-color: ${unlockColour(level.unlocks[0]!)}` },
          `UNLOCKS · ${level.unlocks.map(unlockName).join(', ').toUpperCase()}`,
        ),
    ),
    h('div.grow'),
    cta,
  );
}

export function campaignScreen(state: AppState, selectedId: string | undefined, rerender: () => void): Screen {
  const el = h('div.screen');
  const first = LEVELS.find((l) => cardState(state, l) === 'next') ?? LEVELS[0]!;
  const selected = LEVELS.find((l) => l.id === selectedId) ?? first;

  const grid = h(
    'div.level-grid',
    {},
    ...LEVELS.map((l) =>
      levelCard(l, cardState(state, l), state.profile.levels[l.id]?.bestStars ?? 0, l.id === selected.id, () =>
        navigate({ name: 'campaign', levelId: l.id }, true),
      ),
    ),
  );

  el.append(
    campaignTopbar(state, rerender),
    h(
      'div.campaign-body',
      {},
      h(
        'main.campaign-main.blueprint-grid',
        {},
        h('div.heading', {}, h('div.eyebrow.cyan', {}, 'CAMPAIGN'), h('h1', {}, 'Proving grounds')),
        grid,
        h(
          'div.legend',
          {},
          h('span', {}, h('span.signal', {}, '■'), ' cleared'),
          h('span', {}, h('span.cyan', {}, '■'), ' next'),
          h('span', {}, h('span.dim', {}, '■'), ' locked'),
        ),
      ),
      briefing(state, selected, cardState(state, selected)),
    ),
  );
  return { el };
}

export function freePlayScreen(state: AppState, rerender: () => void): Screen {
  const cleared = LEVELS.filter((l) => state.profile.levels[l.id]?.cleared);
  const el = h(
    'div.screen',
    {},
    campaignTopbar(state, rerender),
    h(
      'main.campaign-main.blueprint-grid.free-main',
      {},
      h(
        'div.heading',
        {},
        h('div.eyebrow.cyan', {}, 'FREE PLAY'),
        h('h1', {}, 'Any bot, any cleared level'),
        h('p.muted', {}, 'Replay levels you have cleared with every part you have unlocked and no budget. Free play runs don\'t change your stars.'),
      ),
      cleared.length
        ? h(
            'div.level-grid',
            {},
            ...cleared.map((l) =>
              levelCard(l, 'cleared', state.profile.levels[l.id]!.bestStars, false, () =>
                navigate({ name: 'workshop', levelId: l.id, free: true }),
              ),
            ),
          )
        : h('p.empty', {}, 'Clear a campaign level first, then come back here to play it your way.'),
      h('a.btn.back', { href: '#/' }, '← Back to the campaign'),
    ),
  );
  return { el };
}
