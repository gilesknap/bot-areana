/** "YOUR PYTHON API" preview (Workshop) and the full API reference drawer (Code screen). */
import type { ApiMethod, PartApi } from '../shared/api';
import type { BotDesign } from '../shared/parts';
import { BOT_ERRORS } from '../shared/errors';
import { CATEGORY_COLOUR, PARTS } from '../parts/catalogue';
import { botApi, signature } from '../parts/api';
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
  if (m.ticks === 'action') return 'until done (1 tick with wait=False)';
  if (m.ticks === 'seconds') return 'the seconds you ask for';
  if (m.ticks === 0) return 'free';
  return `${m.ticks} tick${m.ticks === 1 ? '' : 's'}`;
}

/** Full reference for the fitted parts. */
export function apiReference(design: BotDesign): HTMLElement {
  const out = h('div.api-ref');
  for (const { attr, api } of botApi(design)) {
    const prefix = attr ? `bot.${attr}.` : 'bot.';
    out.append(
      h(
        'section.api-part',
        {},
        h('h3', { style: `color: ${attrColour(api)}` }, attr ? `bot.${attr}` : 'bot'),
        h('p.muted', {}, api.part === 'core' ? api.summary : `${PARTS[api.part].name} · ${api.summary}`),
        ...api.methods.map((m) =>
          h(
            'div.api-method',
            {},
            h('div.api-sig', {}, `${prefix}${signature(m)}`, h('span.muted', {}, ` → ${m.returns}`)),
            h('div.api-summary', {}, m.doc || m.summary),
            m.params.length > 0 &&
              h('ul.api-params', {}, ...m.params.map((p) => h('li', {}, h('code', {}, p.name), ` (${p.type}) ${p.doc}`))),
            h(
              'div.api-cost',
              {},
              `Time: ${tickText(m)}`,
              m.energy ? ` · Energy: ${m.energy}` : '',
              m.raises?.length ? ` · Raises: ${m.raises.join(', ')}` : '',
            ),
            m.example && h('pre.api-example', {}, highlightPython(m.example)),
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
      h('p.muted', {}, 'Distances are in cm (a floor tile is 40 cm). Angles are degrees: heading 0 is up, turning right is positive. A bearing is relative to where your bot faces, + to the right.'),
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
