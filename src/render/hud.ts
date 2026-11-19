/**
 * HULL / ENERGY / objective overlay for the arena panel (Arena.dc.html, top right).
 * Plain DOM; feed it from ArenaView.onTick and onEvent.
 */
import type { Frame, SimEvent, WorldInit } from '../shared/frames';
import type { LevelDef } from '../shared/level';
import { PALETTE } from '../shared/palette';

interface ObjectiveRow {
  value: HTMLSpanElement;
  progress: number;
  total: number;
  done: boolean;
}

const MONO = "'JetBrains Mono', monospace";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, style: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.style.cssText = style;
  e.textContent = text;
  return e;
}

/** Short HUD label for an objective, e.g. 'TURRETS' for "Destroy 5 turrets". */
function hudLabel(o: LevelDef['objectives'][number]): string {
  switch (o.type) {
    case 'reach':
      return 'FLAG';
    case 'waypoints':
      return 'WAYPOINTS';
    case 'collect':
      return 'CORES';
    case 'survive':
      return 'SURVIVE';
    case 'destroy': {
      const words = o.label.toUpperCase().match(/[A-Z]+S\b/g);
      return words?.[words.length - 1] ?? 'TARGETS';
    }
  }
}

export class ArenaHud {
  readonly root: HTMLDivElement;
  private hull: { value: HTMLSpanElement; bar: HTMLDivElement };
  private energy: { value: HTMLSpanElement; bar: HTMLDivElement };
  private objectives = new Map<string, ObjectiveRow>();
  private objectiveBox: HTMLDivElement;
  private maxHp = 100;
  private maxEnergy = 100;
  private playerId = 'player';

  constructor(parent: HTMLElement) {
    this.root = el(
      'div',
      `position:absolute;top:16px;right:16px;display:flex;flex-direction:column;gap:8px;padding:12px 14px;background:rgba(14,21,29,0.92);border:1px solid ${PALETTE.border};border-radius:4px;width:200px;box-sizing:border-box;color:${PALETTE.ink};pointer-events:none;z-index:2`,
    );
    this.root.setAttribute('aria-label', 'Bot status');
    this.hull = this.meter('HULL', PALETTE.amber);
    this.energy = this.meter('ENERGY', PALETTE.core);
    this.objectiveBox = el('div', 'display:flex;flex-direction:column;gap:8px');
    this.root.append(this.objectiveBox);
    parent.append(this.root);
  }

  private meter(label: string, colour: string) {
    const row = el('div', `display:flex;justify-content:space-between;font-family:${MONO};font-size:12px`);
    row.append(el('span', `color:${PALETTE.steel}`, label));
    const value = el('span', '', '0');
    row.append(value);
    const track = el('div', `height:6px;background:${PALETTE.panelActive}`);
    const bar = el('div', `height:6px;width:100%;background:${colour};transition:width 120ms linear`);
    track.append(bar);
    this.root.append(row, track);
    return { value, bar };
  }

  /** Reset for a level: meters full, one row per objective. */
  load(level: LevelDef, world: WorldInit): void {
    const player = world.bots.find((b) => b.team === 'player');
    this.playerId = player?.id ?? 'player';
    this.maxHp = player?.maxHp ?? 100;
    this.maxEnergy = player?.maxEnergy ?? 100;
    this.objectives.clear();
    this.objectiveBox.replaceChildren();
    for (const o of level.objectives) {
      const row = el('div', `display:flex;justify-content:space-between;font-family:${MONO};font-size:12px`);
      row.append(el('span', `color:${PALETTE.steel}`, hudLabel(o)));
      const value = el('span', `color:${PALETTE.signal}`, '');
      row.append(value);
      this.objectiveBox.append(row);
      this.objectives.set(o.id, { value, progress: 0, total: o.type === 'survive' ? o.seconds : 1, done: false });
    }
    this.set(this.maxHp, this.maxEnergy);
    this.renderObjectives();
  }

  private set(hp: number, energy: number): void {
    const h = Math.max(0, Math.round(hp));
    const e = Math.max(0, Math.round(energy));
    this.hull.value.textContent = String(h);
    this.hull.bar.style.width = `${Math.min(100, (100 * h) / this.maxHp)}%`;
    this.hull.bar.style.background = h / this.maxHp < 0.3 ? PALETTE.alert : PALETTE.amber;
    this.energy.value.textContent = String(e);
    this.energy.bar.style.width = `${Math.min(100, (100 * e) / this.maxEnergy)}%`;
  }

  tick(_tick: number, frame: Frame): void {
    const me = frame.bots.find((b) => b.id === this.playerId);
    if (me) this.set(me.hp, me.energy);
  }

  event(e: SimEvent): void {
    if (e.type !== 'objective') return;
    const row = this.objectives.get(e.objectiveId);
    if (!row) return;
    row.progress = e.progress;
    row.total = e.total;
    row.done = e.done;
    this.renderObjectives();
  }

  private renderObjectives(): void {
    for (const row of this.objectives.values()) {
      row.value.textContent = row.done ? `✓ ${row.progress} / ${row.total}` : `${row.progress} / ${row.total}`;
      row.value.style.color = PALETTE.signal;
    }
  }

  destroy(): void {
    this.root.remove();
  }
}
