/** "YOUR PYTHON API" preview (Workshop) and the full API reference drawer (Code screen). */
import type { ApiMethod, PartApi } from '../shared/api';
import type { BotDesign } from '../shared/parts';
import { BOT_ERRORS } from '../shared/errors';
import { CATEGORY_COLOUR, PARTS } from '../parts/catalogue';
import { botApi, signature } from '../parts/api';
import { TICK_RATE } from '../shared/geometry';
import { h } from './dom';
import { highlightPython } from './highlight';

function attrColour(api: PartApi): string {
  return api.part === 'core' ? 'var(--ink)' : CATEGORY_COLOUR[PARTS[api.part].category];
}

/** "forward(distance)": required params only, to keep the preview short. */
function shortCall(m: ApiMethod): string {
  const params = m.params.filter((p) => !p.default).map((p) => (p.variadic ? `*${p.name}` : p.name));
  return `${m.name}(${params.join(', ')})`;
}

export function apiPreview(design: BotDesign): HTMLElement {
  const box = h('div.api-preview');
  for (const { attr, api } of botApi(design)) {
    if (!attr) continue;
    box.append(
      h(
        'div.api-line',
        {},
        h('span', { style: `color: ${attrColour(api)}` }, `bot.${attr}`),
        api.methods.map((m) => `.${shortCall(m)}`).join(' · '),
      ),
    );
  }
  box.append(h('div.api-line.muted', {}, 'bot.log(…) · .wait(seconds) · .health() · .time()'));
  return box;
}

function tickText(m: ApiMethod): string {
  if (m.ticks === 'action') return 'until done';
  if (m.ticks === 'seconds') return 'the seconds you ask for';
  if (m.ticks === 0) return 'free';
  return `${m.ticks} tick${m.ticks === 1 ? '' : 's'}`;
}

function tickTitle(m: ApiMethod): string {
  if (m.ticks === 'action') return 'Takes until the move is done; with wait=False just 1 tick.';
  if (m.ticks === 'seconds') return 'Takes as long as you ask it to wait.';
  if (m.ticks === 0) return 'Takes no time at all.';
  return `Takes ${tickText(m)} of game time (${TICK_RATE} ticks = 1 second).`;
}

/** `name(a, b=1)` with the name picked out. */
function sigEl(prefix: string, m: ApiMethod): HTMLElement {
  return h(
    'div.api-sig',
    {},
    h('span.muted', {}, prefix),
    h('span.api-name', {}, m.name),
    signature(m).slice(m.name.length),
    h('span.api-returns', {}, ` → ${m.returns}`),
  );
}

/**
 * Full reference for the fitted parts, generated from the parts API spec. With `onInsert`, each
 * method's example has an Insert button (and the example itself is clickable).
 */
export function apiReference(design: BotDesign, onInsert?: (code: string) => void): HTMLElement {
  const out = h('div.api-ref');
  const api = botApi(design);
  const anchor = (attr: string) => `api-${attr || 'bot'}`;
  out.append(
    h('div.eyebrow', {}, 'API REFERENCE · YOUR FITTED PARTS'),
    h(
      'nav.api-jump',
      { 'aria-label': 'Parts' },
      ...api.map(({ attr, api: a }) =>
        h('a.api-chip', { href: `#${anchor(attr)}`, style: `color: ${attrColour(a)}`, onclick: (e: Event) => {
          e.preventDefault();
          out.querySelector(`#${anchor(attr)}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        } }, attr ? `bot.${attr}` : 'bot'),
      ),
    ),
  );
  for (const { attr, api: a } of api) {
    const prefix = attr ? `bot.${attr}.` : 'bot.';
    out.append(
      h(
        'section.api-part',
        { id: anchor(attr) },
        h('h3', { style: `color: ${attrColour(a)}` }, attr ? `bot.${attr}` : 'bot'),
        h('p.muted', {}, a.part === 'core' ? a.summary : `${PARTS[a.part].name} · ${a.summary}`),
        ...a.methods.map((m) =>
          h(
            'div.api-method',
            {},
            sigEl(prefix, m),
            h('div.api-summary', {}, m.doc || m.summary),
            m.params.length > 0 &&
              h('ul.api-params', {}, ...m.params.map((p) => h('li', {}, h('code', {}, p.name), ` (${p.type}${p.default ? ` = ${p.default}` : ''}) ${p.doc}`))),
            h(
              'div.api-badges',
              {},
              h('span.api-badge.time', { title: tickTitle(m) }, `⏱ ${tickText(m)}`),
              m.energy ? h('span.api-badge.energy', { title: 'Energy used per call' }, `⚡ ${m.energy}`) : '',
              ...(m.raises ?? []).map((r) => h('span.api-badge.raises', { title: BOT_ERRORS[r].message }, `raises ${r}`)),
            ),
            m.example &&
              h(
                'div.api-example-row',
                {},
                h(
                  'pre.api-example',
                  onInsert ? { title: 'Click to insert into your script', onclick: () => onInsert(m.example!) } : {},
                  highlightPython(m.example),
                ),
                onInsert &&
                  h('button.btn.small.api-insert', { type: 'button', 'aria-label': `Insert example: ${prefix}${m.name}`, onclick: () => onInsert(m.example!) }, 'Insert'),
              ),
          ),
        ),
      ),
    );
  }
  out.append(
    h(
      'section.api-part',
      {},
      h('h3', { style: 'color: var(--alert)' }, 'Errors'),
      h('p.muted', {}, 'All are BotError subclasses, so `except BotError:` catches any of them.'),
      ...Object.entries(BOT_ERRORS).map(([name, e]) => h('div.api-method', {}, h('div.api-sig', {}, name), h('div.api-summary', {}, `${e.message} ${e.tip}`))),
    ),
    h(
      'section.api-part',
      {},
      h('h3', {}, 'Units'),
      h('p.muted', {}, `Distances are in cm (a floor tile is 40 cm). Angles are degrees: heading 0 is up, turning right is positive. A bearing is relative to where your bot faces, + to the right. ${TICK_RATE} ticks make one second.`),
    ),
  );
  return out;
}

/** Completion entries for CodeMirror: bot attributes and each attribute's methods. */
export function completionData(design: BotDesign): { attrs: Array<{ label: string; detail: string; info: string }>; methods: Map<string, ApiMethod[]> } {
  const attrs: Array<{ label: string; detail: string; info: string }> = [];
  const methods = new Map<string, ApiMethod[]>();
  for (const { attr, api } of botApi(design)) {
    methods.set(attr, [...api.methods]);
    if (attr) attrs.push({ label: attr, detail: PARTS[api.part as keyof typeof PARTS]?.name ?? '', info: api.summary });
  }
  return { attrs, methods };
}
