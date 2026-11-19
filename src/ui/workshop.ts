/** Workshop: parts bin, chassis blueprint with slot drop targets, meters, API preview. Workshop.dc.html. */
import type { BotDesign, ChassisId, PartCategory, PartDef, PartId } from '../shared/parts';
import { CATEGORY_COLOUR, CATEGORY_LABEL, CHASSIS, PARTS, PLAYER_CHASSIS, PLAYER_PARTS } from '../parts/catalogue';
import { LEVELS } from '../levels';
import { partGlyphSvg } from '../render/glyphs';
import { encodeShare } from '../save';
import { apiPreview } from './apiRef';
import { levelTopbar, openDialog, type Screen } from './chrome';
import { h, icon, svg, toast } from './dom';
import { getDesign, getScript, setDesign, type AppState, type LevelContext } from './state';
import { canFit, designIssues, fitPart, issueText, meters, removePart, setChassis, type Mount } from './workshopRules';

const CATEGORIES: PartCategory[] = ['locomotion', 'sensor', 'offense', 'defense', 'core'];
const METER_COLOURS = ['var(--cyan)', 'var(--core)', 'var(--signal)', 'var(--amber)'];
const DRAG_TYPE = 'application/x-bot-part';

function partStats(p: PartDef): string {
  return p.power ? `${p.weight} kg · ${p.power} W` : `${p.weight} kg`;
}

/** Level number that first unlocks a part or chassis, if any. */
function unlockLevel(id: PartId | ChassisId): number | undefined {
  return LEVELS.find((l) => l.unlocks.includes(id))?.number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Blueprint geometry (viewBox 560 x 620) for each chassis size. */
function layout(chassis: ChassisId): { body: Box; slots: Record<string, Box> } {
  const body: Box =
    chassis === 'chassis_s'
      ? { x: 200, y: 180, w: 160, h: 260 }
      : chassis === 'chassis_l'
        ? { x: 165, y: 135, w: 230, h: 350 }
        : { x: 180, y: 150, w: 200, h: 320 };
  const cx = body.x + body.w / 2;
  const cy = body.y + body.h / 2;
  return {
    body,
    slots: {
      front: { x: cx - 50, y: body.y - 84, w: 100, h: 70 },
      centre: { x: cx - 50, y: cy - 40, w: 100, h: 80 },
      rear: { x: cx - 50, y: body.y + body.h + 26, w: 100, h: 70 },
      left: { x: body.x - 140, y: cy - 40, w: 90, h: 80 },
      right: { x: body.x + body.w + 50, y: cy - 40, w: 90, h: 80 },
    },
  };
}

/** A part glyph as a nested <svg> positioned inside the blueprint. */
function glyph(part: PartId, x: number, y: number, size: number): SVGElement {
  const g = svg('g');
  g.innerHTML = partGlyphSvg(part, size);
  const inner = g.querySelector('svg');
  inner?.setAttribute('x', String(x));
  inner?.setAttribute('y', String(y));
  inner?.setAttribute('width', String(size));
  inner?.setAttribute('height', String(size));
  return g;
}

export function workshopScreen(state: AppState, ctx: LevelContext): Screen {
  let design: BotDesign = getDesign(state, ctx);
  /** Part picked by click (keyboard / no-drag fallback). */
  let selected: PartId | null = null;
  let dragging: PartId | null = null;

  const bin = h('div.bin');
  const blueprintHost = h('div.blueprint');
  const spec = h('div.spec');
  const el = h(
    'div.screen',
    {},
    levelTopbar(ctx.level, ctx.free, 'workshop', state),
    h('div.workshop-body', {}, bin, blueprintHost, spec),
  );

  const update = (next: BotDesign) => {
    if (next === design) return;
    design = next;
    setDesign(state, ctx, design);
    render();
  };

  const select = (part: PartId | null) => {
    selected = selected === part ? null : part;
    render();
    // The bin was rebuilt: keep keyboard focus on the same part.
    if (part) (bin.querySelector(`[data-part="${part}"]`) as HTMLElement | null)?.focus();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && selected) select(null);
  };
  document.addEventListener('keydown', onKey);

  // ---- Parts bin ----
  function renderBin() {
    bin.replaceChildren(h('div.eyebrow', {}, 'PARTS BIN'));
    const locked: Array<{ name: string; note: string }> = [];
    for (const cat of CATEGORIES) {
      const parts = PLAYER_PARTS.filter((p) => p.category === cat);
      const available = parts.filter((p) => !p.comingSoon && ctx.unlocked.has(p.id));
      for (const p of parts) {
        if (p.comingSoon) locked.push({ name: p.name, note: 'later' });
        else if (!ctx.unlocked.has(p.id)) {
          const n = unlockLevel(p.id);
          locked.push({ name: p.name, note: n ? `unlocks at level ${n}` : 'locked' });
        }
      }
      if (!available.length) continue;
      bin.append(
        h(
          'div.bin-group',
          {},
          h('div.bin-cat', { style: `color: ${CATEGORY_COLOUR[cat]}` }, CATEGORY_LABEL[cat]),
          ...available.map((p) =>
            h(
              'button.part',
              {
                type: 'button',
                draggable: 'true',
                class: selected === p.id ? 'selected' : '',
                'data-part': p.id,
                'aria-pressed': selected === p.id ? 'true' : 'false',
                title: p.blurb,
                onclick: () => select(p.id),
                ondragstart: (e: Event) => {
                  const de = e as DragEvent;
                  de.dataTransfer?.setData(DRAG_TYPE, p.id);
                  de.dataTransfer?.setData('text/plain', p.name);
                  if (de.dataTransfer) de.dataTransfer.effectAllowed = 'copy';
                  dragging = p.id;
                  highlightTargets();
                },
                ondragend: () => {
                  dragging = null;
                  highlightTargets();
                },
              },
              h('span', {}, p.name),
              h('span.part-stats', {}, partStats(p)),
            ),
          ),
        ),
      );
    }
    for (const c of PLAYER_CHASSIS) {
      if (ctx.unlocked.has(c.id)) continue;
      const n = unlockLevel(c.id);
      locked.push({ name: c.name, note: n ? `unlocks at level ${n}` : 'locked' });
    }
    for (const l of locked) bin.append(h('div.part-locked', {}, icon('lock'), `${l.name} · ${l.note}`));
  }

  // ---- Blueprint ----
  const targets = new Map<Mount, SVGGElement>();

  function highlightTargets() {
    const part = dragging ?? selected;
    for (const [mount, g] of targets) {
      const ok = !!part && canFit(design.chassis, part, mount);
      g.classList.toggle('target', ok);
      g.classList.toggle('dim', !!part && !ok);
    }
  }

  function activate(mount: Mount) {
    if (selected) {
      if (canFit(design.chassis, selected, mount)) {
        const part = selected;
        selected = null;
        update(fitPart(design, part, mount));
      } else toast(`The ${PARTS[selected].name} doesn't fit the ${mount} slot.`, 'error');
      return;
    }
    const fitted = mount === 'drive' ? design.drive : design.slots[mount];
    if (fitted) update(removePart(design, mount));
    else toast('Pick a part from the bin, then click a glowing slot.');
  }

  function mountTarget(mount: Mount, label: string, ...children: SVGElement[]): SVGGElement {
    const fitted = mount === 'drive' ? design.drive : design.slots[mount];
    const g = svg(
      'g',
      {
        class: 'mount',
        tabindex: 0,
        role: 'button',
        'aria-label': fitted ? `${label}: ${PARTS[fitted].name}. Press to remove.` : `${label}: empty`,
      },
      ...children,
    );
    g.addEventListener('click', () => activate(mount));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate(mount);
      }
    });
    g.addEventListener('dragover', (e) => {
      if (dragging && canFit(design.chassis, dragging, mount)) {
        e.preventDefault();
        g.classList.add('over');
      }
    });
    g.addEventListener('dragleave', () => g.classList.remove('over'));
    g.addEventListener('drop', (e) => {
      e.preventDefault();
      g.classList.remove('over');
      const part = (e.dataTransfer?.getData(DRAG_TYPE) || dragging) as PartId | null;
      dragging = null;
      if (part && canFit(design.chassis, part, mount)) update(fitPart(design, part, mount));
    });
    targets.set(mount, g);
    return g;
  }

  function driveMount(body: Box): SVGGElement {
    const drive = design.drive;
    const colour = 'var(--cyan)';
    const style = drive
      ? { stroke: colour, fill: colour, 'fill-opacity': 0.25, 'stroke-width': 2 }
      : { stroke: 'var(--steel)', 'stroke-dasharray': '6 5', 'stroke-width': 2 };
    const shapes: SVGElement[] = [];
    const lx = body.x - 40;
    const rx = body.x + body.w;
    if (drive === 'tracks') {
      for (const x of [lx, rx]) {
        shapes.push(svg('rect', { x, y: body.y + 10, width: 40, height: body.h - 20, rx: 6, ...style }));
        for (let y = body.y + 30; y < body.y + body.h - 20; y += 22) {
          shapes.push(svg('path', { d: `M${x} ${y}h40`, stroke: colour, 'stroke-width': 1.5 }));
        }
      }
    } else if (drive === 'hover') {
      shapes.push(
        svg('rect', {
          x: body.x - 26,
          y: body.y - 16,
          width: body.w + 52,
          height: body.h + 32,
          rx: 40,
          stroke: colour,
          'stroke-dasharray': '8 6',
          'stroke-width': 2,
          fill: colour,
          'fill-opacity': 0.05,
        }),
      );
    } else {
      for (const x of [lx, rx]) {
        for (const y of [body.y + 20, body.y + body.h - 100]) {
          shapes.push(svg('rect', { x, y, width: 40, height: 80, rx: 6, ...style }));
        }
      }
    }
    const tx = rx + 60;
    const ty = body.y + 50;
    shapes.push(
      svg('path', { d: `M${rx + 40} ${ty - 4}H${tx - 6}`, stroke: 'var(--border)' }),
      svg('text', { x: tx, y: ty - 10, class: 'bp-slot-label', fill: drive ? colour : 'var(--steel)' }, 'DRIVE'),
      svg('text', { x: tx, y: ty + 8, class: 'bp-part-name' }, drive ? PARTS[drive].name : 'empty'),
    );
    return mountTarget('drive', 'Drive train', ...shapes);
  }

  function slotMount(slot: Exclude<Mount, 'drive'>, b: Box): SVGGElement {
    const part = design.slots[slot];
    const colour = part ? CATEGORY_COLOUR[PARTS[part].category] : 'var(--steel)';
    const shapes: SVGElement[] = [
      svg('rect', {
        x: b.x,
        y: b.y,
        width: b.w,
        height: b.h,
        rx: 6,
        stroke: colour,
        'stroke-width': 2,
        ...(part ? { fill: colour, 'fill-opacity': 0.12 } : { 'stroke-dasharray': '6 5', fill: 'transparent' }),
        class: 'slot-rect',
      }),
      svg('text', { x: b.x + b.w / 2, y: b.y - 8, class: 'bp-slot-label', fill: colour, 'text-anchor': 'middle' }, slot.toUpperCase()),
    ];
    if (part) {
      shapes.push(
        glyph(part, b.x + b.w / 2 - 20, b.y + 6, 40),
        svg('text', { x: b.x + b.w / 2, y: b.y + b.h - 10, class: 'bp-part-name small', 'text-anchor': 'middle' }, PARTS[part].name),
      );
    } else {
      shapes.push(svg('text', { x: b.x + b.w / 2, y: b.y + b.h / 2 + 5, class: 'bp-empty', 'text-anchor': 'middle' }, 'empty'));
    }
    return mountTarget(slot, `${slot} slot`, ...shapes);
  }

  function renderBlueprint() {
    targets.clear();
    const { body, slots } = layout(design.chassis);
    const chassis = CHASSIS[design.chassis];
    const art = svg(
      'svg',
      { viewBox: '0 0 560 620', class: 'bp-svg', role: 'group', 'aria-label': `${chassis.name} blueprint` },
      svg('rect', { x: body.x, y: body.y, width: body.w, height: body.h, rx: 24, stroke: 'var(--cyan)', 'stroke-width': 2, fill: 'var(--cyan)', 'fill-opacity': 0.06 }),
      driveMount(body),
      ...chassis.slots.map((s) => slotMount(s, slots[s]!)),
      svg('text', { x: 280, y: 606, class: 'bp-caption', 'text-anchor': 'middle' }, 'Drag a part onto a glowing slot. Click a fitted part to remove it.'),
    );
    const chassisPicker = h(
      'div.seg',
      { role: 'group', 'aria-label': 'Chassis size' },
      ...PLAYER_CHASSIS.map((c) => {
        const open = ctx.unlocked.has(c.id);
        return h(
          'button',
          {
            type: 'button',
            class: c.id === design.chassis ? 'active' : '',
            'aria-pressed': c.id === design.chassis ? 'true' : 'false',
            disabled: !open,
            title: open ? `${c.name}: ${c.hp} HP, max ${c.maxWeight} kg` : `${c.name} unlocks at level ${unlockLevel(c.id) ?? '?'}`,
            onclick: () => update(setChassis(design, c.id)),
          },
          c.size,
        );
      }),
    );
    blueprintHost.replaceChildren(
      h('div.bp-head', {}, h('div.eyebrow', {}, `${chassis.name.toUpperCase()} · TOP VIEW · FRONT ↑`), chassisPicker),
      selected ? h('div.bp-picked', {}, `Placing: ${PARTS[selected].name} — click a glowing slot (Esc to cancel)`) : '',
      art,
    );
    highlightTargets();
  }

  // ---- Specification ----
  function renderSpec() {
    const issues = designIssues(design, ctx.budget, ctx.unlocked);
    spec.replaceChildren(
      h('div.eyebrow', {}, 'SPECIFICATION'),
      ...meters(design, ctx.budget).map((m, i) => {
        const colour = m.over ? 'var(--alert)' : METER_COLOURS[i];
        return h(
          'div.meter',
          {},
          h('div.meter-row', {}, h('span', {}, m.label), h('span.mono', { style: `color: ${colour}` }, m.value)),
          h('div.meter-track', {}, h('div.meter-fill', { style: `width: ${(m.fill * 100).toFixed(0)}%; background: ${colour}` })),
        );
      }),
      issues.length === 0 ? '' : h('ul.issues', { role: 'alert' }, ...issues.map((i) => h('li', {}, issueText(i)))),
      h('div.eyebrow.spaced', {}, 'YOUR PYTHON API'),
      apiPreview(design),
      h('div.note', {}, 'Names come from the parts you fit. Remove a part and its API disappears from your script.'),
      h('div.grow'),
      h('button.btn.share', { type: 'button', onclick: share }, icon('share'), ' Share this bot'),
      h('a.cta', { href: `#/${ctx.free ? 'free' : 'level'}/${ctx.level.id}/code` }, 'Write the code →'),
    );
  }

  function share() {
    const payload = encodeShare({
      v: 1,
      name: `${state.profile.name}'s bot`,
      level: ctx.level.id,
      design,
      script: getScript(state, ctx),
    });
    const url = `${location.origin}${location.pathname}#/share/${payload}`;
    const input = h('input.text.wide', { value: url, readonly: true, 'aria-label': 'Share link' });
    openDialog(
      'Share this bot',
      h(
        'div.share-body',
        {},
        h('p.muted', {}, 'Anyone with this link gets a copy of your bot design and its script.'),
        input,
        h(
          'button.btn',
          {
            type: 'button',
            onclick: async () => {
              try {
                await navigator.clipboard.writeText(url);
                toast('Link copied.');
              } catch {
                input.select();
                toast('Select the link and copy it.');
              }
            },
          },
          'Copy link',
        ),
      ),
    );
    input.select();
  }

  function render() {
    renderBin();
    renderBlueprint();
    renderSpec();
  }

  render();
  return { el, destroy: () => document.removeEventListener('keydown', onKey) };
}
