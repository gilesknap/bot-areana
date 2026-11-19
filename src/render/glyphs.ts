/**
 * Procedural part glyphs and composed bots as SVG strings (docs/visual/Main.dc.html).
 *
 * The same functions feed the Workshop UI (inline SVG) and the arena (the SVG is rasterised
 * into a Phaser texture), so a part looks identical everywhere. No DOM needed: plain strings.
 *
 * Bot space: units are cm, origin at the bot's centre, facing up (-y), like heading 0.
 */
import { CATEGORY_COLOUR, CHASSIS, PARTS } from '../parts/catalogue';
import type { Team } from '../shared/frames';
import { PALETTE } from '../shared/palette';
import type { BotDesign, ChassisId, PartId, SlotId, Terrain } from '../shared/parts';
import { SLOT_ANGLE } from '../shared/parts';

let uid = 0;
const nextId = (p: string) => `${p}${++uid}`;

function svg(viewBox: string, size: number, body: string, extra = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}" fill="none" stroke-width="2"${extra}>${body}</svg>`;
}

// ---- Part glyphs (80 x 80, exactly the Main.dc.html drawings) -----------------------------

const PART_GLYPH: Record<PartId, string> = {
  wheels:
    '<rect x="16" y="20" width="8" height="14" rx="2" fill="C" fill-opacity="0.3"/><rect x="56" y="20" width="8" height="14" rx="2" fill="C" fill-opacity="0.3"/><rect x="16" y="46" width="8" height="14" rx="2" fill="C" fill-opacity="0.3"/><rect x="56" y="46" width="8" height="14" rx="2" fill="C" fill-opacity="0.3"/><rect x="26" y="22" width="28" height="36" rx="4" stroke-dasharray="3 3" stroke="#93A4B5"/>',
  tracks:
    '<rect x="12" y="14" width="12" height="52" rx="3" fill="C" fill-opacity="0.15"/><rect x="56" y="14" width="12" height="52" rx="3" fill="C" fill-opacity="0.15"/><path d="M12 24h12M12 34h12M12 44h12M12 54h12M56 24h12M56 34h12M56 44h12M56 54h12" stroke-width="1.5"/><rect x="26" y="20" width="28" height="40" rx="4" stroke-dasharray="3 3" stroke="#93A4B5"/>',
  hover:
    '<ellipse cx="40" cy="40" rx="28" ry="30" stroke-dasharray="5 4"/><ellipse cx="40" cy="40" rx="22" ry="24" fill="C" fill-opacity="0.1"/><path d="M30 70l-4 6M40 70v7M50 70l4 6" stroke-width="1.5"/>',
  pivot:
    '<circle cx="40" cy="40" r="16" fill="C" fill-opacity="0.12"/><path d="M40 14a26 26 0 0 1 26 26" stroke-dasharray="4 3"/><path d="M60 34l6 6 4-8"/><path d="M40 66a26 26 0 0 1-26-26" stroke-dasharray="4 3"/><path d="M20 46l-6-6-4 8"/>',
  rangefinder:
    '<rect x="32" y="44" width="16" height="12" rx="2" fill="C" fill-opacity="0.2"/><path d="M40 44L28 10M40 44L52 10" stroke-dasharray="3 3" stroke-width="1.5"/><path d="M28 10Q40 4 52 10"/>',
  radar:
    '<circle cx="40" cy="44" r="8" fill="C" fill-opacity="0.2"/><path d="M22 44a18 18 0 0 1 36 0" /><path d="M12 44a28 28 0 0 1 56 0" stroke-dasharray="4 4" stroke-width="1.5"/><line x1="40" y1="44" x2="58" y2="26"/>',
  gps: '<circle cx="40" cy="40" r="18" fill="C" fill-opacity="0.1"/><path d="M40 16v10M40 54v10M16 40h10M54 40h10"/><path d="M40 28l5 12h-10z" fill="C"/>',
  bump: '<path d="M18 30h44" stroke-width="5" stroke-linecap="round"/><path d="M26 30v10M54 30v10"/><rect x="24" y="40" width="32" height="24" rx="4" stroke-dasharray="3 3" stroke="#93A4B5"/>',
  blaster:
    '<rect x="30" y="42" width="20" height="18" rx="3" fill="C" fill-opacity="0.2"/><rect x="36" y="14" width="8" height="28" rx="1"/><circle cx="40" cy="8" r="3" fill="C"/>',
  ram: '<path d="M18 44L26 18L34 44M32 44L40 12L48 44M46 44L54 18L62 44" fill="C" fill-opacity="0.15"/><path d="M16 44h48" stroke-width="3"/>',
  mine_dropper:
    '<rect x="28" y="18" width="24" height="28" rx="4" fill="C" fill-opacity="0.15"/><circle cx="40" cy="62" r="7"/><path d="M40 55v-3M47 62h3M33 62h-3M40 69v3" stroke-width="1.5"/><path d="M40 46v6" stroke-dasharray="2 2"/>',
  armour:
    '<path d="M20 16L30 12V68L20 64Z" fill="C" fill-opacity="0.25"/><path d="M60 16L50 12V68L60 64Z" fill="C" fill-opacity="0.25"/><path d="M24 26v28M56 26v28" stroke-width="1"/>',
  shield:
    '<circle cx="40" cy="40" r="30" stroke-dasharray="6 4" fill="C" fill-opacity="0.06"/><path d="M40 24l12 5v10c0 9-6 14-12 17-6-3-12-8-12-17V29z" fill="C" fill-opacity="0.2"/>',
  battery:
    '<rect x="24" y="22" width="32" height="40" rx="4" fill="C" fill-opacity="0.12"/><rect x="34" y="16" width="12" height="6" rx="1"/><path d="M40 32v12M34 38h12"/><path d="M30 54h20" stroke-width="3"/>',
  battery_plus:
    '<rect x="20" y="20" width="40" height="44" rx="4" fill="C" fill-opacity="0.18"/><rect x="33" y="14" width="14" height="6" rx="1"/><path d="M33 34v10M28 39h10M47 34v10M42 39h10"/><path d="M28 54h24" stroke-width="3"/><path d="M28 59h24" stroke-width="1.5"/>',
};

function chassisGlyph(id: ChassisId): string {
  if (id === 'turret_base') {
    return '<path d="M30 12h20l18 18v20l-18 18h-20l-18-18v-20z" fill="C" fill-opacity="0.08"/><circle cx="40" cy="40" r="12"/><rect x="36" y="8" width="8" height="20" rx="1"/>';
  }
  const [w, h] = id === 'chassis_s' ? [28, 36] : id === 'chassis_m' ? [36, 44] : [44, 54];
  const x = 40 - w / 2;
  const y = 40 - h / 2;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="C" fill-opacity="0.08"/><line x1="40" y1="${y}" x2="40" y2="${y + 10}"/><circle cx="40" cy="40" r="4"/>`;
}

/** Colour a part or chassis glyph is drawn in (its category colour; chassis are cyan). */
export function glyphColour(id: PartId | ChassisId): string {
  return id in PARTS ? CATEGORY_COLOUR[PARTS[id as PartId].category] : PALETTE.cyan;
}

/** The 80 x 80 Main.dc.html glyph for a part or chassis, as an SVG string. */
export function partGlyphSvg(id: PartId | ChassisId, size = 80, colour = glyphColour(id)): string {
  const body = id in PARTS ? PART_GLYPH[id as PartId] : chassisGlyph(id as ChassisId);
  return svg('0 0 80 80', size, body.replace(/"C"/g, `"${colour}"`), ` stroke="${colour}" aria-hidden="true"`);
}

// ---- Composed bots ----------------------------------------------------------------------------

/** Hull half-width / half-length per chassis, cm. */
export const HULL: Record<Exclude<ChassisId, 'turret_base'>, { hw: number; hh: number; rx: number }> = {
  chassis_s: { hw: 12, hh: 17, rx: 5 },
  chassis_m: { hw: 17, hh: 25, rx: 7 },
  chassis_l: { hw: 22, hh: 30, rx: 8 },
};

/** Half the side of the square that holds any bot of this chassis, cm. */
export function botHalfExtent(chassis: ChassisId): number {
  return CHASSIS[chassis].radius + 26;
}

export interface BotStyle {
  stroke: string;
  hullA: string;
  hullB: string;
  dark: string;
  light: string;
}

export function teamStyle(team: Team): BotStyle {
  return team === 'player'
    ? { stroke: PALETTE.cyan, hullA: '#1F5662', hullB: '#0E2830', dark: '#0E1A20', light: '#E8FBFF' }
    : { stroke: PALETTE.amber, hullA: '#5A4520', hullB: '#2A2112', dark: '#1E170C', light: '#FFE2A8' };
}

/** A fitted part in its slot frame: origin on the hull edge, "outward" is up (-y). */
function slotPart(part: PartId, edge: number, s: BotStyle, uidGlow: string): string {
  const c = CATEGORY_COLOUR[PARTS[part].category];
  switch (part) {
    case 'rangefinder':
      return (
        `<path d="M0 -4L-9 -22M0 -4L9 -22" stroke="${c}" stroke-opacity="0.45" stroke-dasharray="3 3" stroke-width="1.2"/>` +
        `<rect x="-6" y="-5" width="12" height="9" rx="1.5" fill="${s.dark}" stroke="${c}" stroke-width="1.5"/>` +
        `<circle cy="-0.5" r="1.8" fill="${c}"/>`
      );
    case 'bump': {
      const l = edge * 0.75;
      return `<path d="M${-l} -4H${l}" stroke="${c}" stroke-width="4" stroke-linecap="round"/><path d="M${-l * 0.6} -4v5M${l * 0.6} -4v5" stroke="${c}" stroke-width="1.5"/>`;
    }
    case 'blaster':
      return (
        `<rect x="-7" y="-1" width="14" height="10" rx="2" fill="${c}" fill-opacity="0.25" stroke="${c}" stroke-width="1.5"/>` +
        `<rect x="-3.5" y="-17" width="7" height="18" fill="#1A0E10" stroke="${c}" stroke-width="1.5"/>` +
        `<circle cy="-17" r="1.6" fill="${c}" filter="url(#${uidGlow})"/>`
      );
    case 'ram': {
      const l = edge * 0.9;
      const n = 3;
      const step = (2 * l) / n;
      let d = '';
      for (let i = 0; i < n; i++) {
        const x0 = -l + i * step;
        d += `M${x0} 0L${x0 + step / 2} ${i === 1 ? -14 : -11}L${x0 + step} 0`;
      }
      return `<path d="${d}" fill="${c}" fill-opacity="0.25" stroke="${c}" stroke-width="1.5" stroke-linejoin="round"/><path d="M${-l - 1} 0H${l + 1}" stroke="${c}" stroke-width="3"/>`;
    }
    case 'mine_dropper':
      return `<rect x="-7" y="-8" width="14" height="10" rx="2" fill="${c}" fill-opacity="0.2" stroke="${c}" stroke-width="1.5"/><circle cy="-11" r="3" stroke="${c}" stroke-width="1.2"/>`;
    case 'armour': {
      const l = edge * 0.85;
      return `<path d="M${-l} -4L${-l + 3} -7H${l - 3}L${l} -4V2H${-l}Z" fill="${c}" fill-opacity="0.3" stroke="${c}" stroke-width="1.5"/><path d="M${-l + 5} -2.5H${l - 5}" stroke="${c}" stroke-width="1"/>`;
    }
    case 'shield':
      return `<path d="M0 -10l7 3v5c0 5-3.5 8-7 9.5-3.5-1.5-7-4.5-7-9.5v-5z" fill="${s.dark}" stroke="${c}" stroke-width="1.5"/><path d="M0 -6l3.5 1.5v3c0 2.5-1.8 4-3.5 5z" fill="${c}" fill-opacity="0.5"/>`;
    case 'radar':
      return `<circle r="5" fill="${c}" fill-opacity="0.3" stroke="${c}" stroke-width="1.5"/><path d="M-9 -2a9 9 0 0 1 18 0" stroke="${c}" stroke-width="1.5"/><path d="M0 0L6 -6" stroke="${c}" stroke-width="1.2"/>`;
    case 'gps':
      return `<circle r="6" fill="${s.dark}" stroke="${c}" stroke-width="1.5"/><path d="M0 -3.5l2.4 5h-4.8z" fill="${c}"/><path d="M0 -9v2M0 7v2M-9 0h2M7 0h2" stroke="${c}" stroke-width="1.2"/>`;
    case 'battery':
      return `<rect x="-8" y="-4" width="16" height="8" rx="1.5" fill="${c}" fill-opacity="0.35" stroke="${c}" stroke-width="1"/><path d="M-3 0h6M0 -2.5v5" stroke="${c}" stroke-width="1"/>`;
    case 'battery_plus':
      return `<rect x="-10" y="-5" width="20" height="10" rx="1.5" fill="${c}" fill-opacity="0.45" stroke="${c}" stroke-width="1.2"/><path d="M-7 0h5M-4.5 -2.5v5M2 0h5M4.5 -2.5v5" stroke="${c}" stroke-width="1"/>`;
    default:
      return '';
  }
}

function driveSvg(design: BotDesign, hw: number, hh: number, s: BotStyle): string {
  switch (design.drive) {
    case 'wheels': {
      const [w, h] = hw < 15 ? [8, 13] : [10, 16];
      const xs = [-hw - w + 0.5, hw - 0.5];
      const ys = [-hh + 2, hh - h - 1];
      let out = '';
      for (const x of xs)
        for (const y of ys) {
          out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${s.dark}" stroke="${s.stroke}" stroke-width="1.5"/>`;
          out += `<path d="M${x} ${y + h * 0.33}h${w}M${x} ${y + h * 0.66}h${w}" stroke="${s.stroke}" stroke-opacity="0.6" stroke-width="1"/>`;
        }
      return out;
    }
    case 'tracks': {
      const w = hw < 15 ? 9 : 12;
      const len = 2 * hh + 6;
      let out = '';
      for (const x of [-hw - w + 1, hw - 1]) {
        out += `<rect x="${x}" y="${-hh - 3}" width="${w}" height="${len}" rx="3" fill="${s.dark}" stroke="${s.stroke}" stroke-width="1.5"/>`;
        let d = '';
        for (let y = -hh + 3; y < hh + 1; y += 6) d += `M${x + 1} ${y}h${w - 2}`;
        out += `<path d="${d}" stroke="${s.stroke}" stroke-opacity="0.55" stroke-width="1.2"/>`;
      }
      return out;
    }
    case 'hover':
      return (
        `<ellipse rx="${hw + 9}" ry="${hh + 7}" fill="${s.stroke}" fill-opacity="0.07" stroke="${s.stroke}" stroke-dasharray="5 4" stroke-width="1.5"/>` +
        `<path d="M${-hw * 0.6} ${hh + 9}l-2 4M0 ${hh + 9}v4M${hw * 0.6} ${hh + 9}l2 4" stroke="${s.stroke}" stroke-opacity="0.7" stroke-width="1.2"/>`
      );
    default:
      return '';
  }
}

function defs(s: BotStyle, hullId: string, glowId: string, headId: string): string {
  return (
    `<defs><linearGradient id="${hullId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${s.hullA}"/><stop offset="1" stop-color="${s.hullB}"/></linearGradient>` +
    `<radialGradient id="${headId}" cx="0.35" cy="0.35"><stop offset="0" stop-color="#6B5022"/><stop offset="1" stop-color="#2A2112"/></radialGradient>` +
    `<filter id="${glowId}" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`
  );
}

/** Octagonal turret base (does not rotate). */
export function turretBaseBody(): string {
  return '<path d="M-10 -24h20l14 14v20l-14 14h-20l-14-14v-20z" fill="#1E2732" stroke="#5B6B7C" stroke-width="1.5"/><path d="M-7 -19h14l10 10v14l-10 10h-14l-10-10v-14z" stroke="#2C3846" stroke-width="1"/>';
}

/** Turret head (rotates): barrel, domed head and red LED. */
function turretHeadBody(s: BotStyle, headId: string, glowId: string): string {
  return (
    `<rect x="-4" y="-34" width="8" height="24" rx="1" fill="#3A2E1A" stroke="${s.stroke}" stroke-width="1.5"/>` +
    `<path d="M-4 -30h8" stroke="${s.stroke}" stroke-opacity="0.5" stroke-width="1"/>` +
    `<circle r="14" fill="url(#${headId})" stroke="${s.stroke}" stroke-width="2"/>` +
    `<circle r="3" fill="${PALETTE.alert}" filter="url(#${glowId})"/>`
  );
}

export interface BotSvgOptions {
  team: Team;
  /** Pixel size of the (square) SVG. Default 120. */
  size?: number;
  /** 'all' (default) for the UI; the arena draws turret bases and heads as separate layers. */
  layer?: 'all' | 'base' | 'top';
}

/** Body markup of a bot (hull, drive, parts) in bot space, plus its <defs>. */
export function botBody(design: BotDesign, team: Team, layer: BotSvgOptions['layer'] = 'all'): string {
  const s = teamStyle(team);
  const hullId = nextId('hull');
  const glowId = nextId('glow');
  const headId = nextId('head');
  let out = defs(s, hullId, glowId, headId);

  if (design.chassis === 'turret_base') {
    if (layer !== 'top') out += turretBaseBody();
    if (layer !== 'base') out += turretHeadBody(s, headId, glowId);
    return out;
  }

  const { hw, hh, rx } = HULL[design.chassis];
  out += driveSvg(design, hw, hh, s);

  const slots = design.slots;
  const anchors: Record<Exclude<SlotId, 'centre'>, [number, number, number]> = {
    front: [0, -hh, hw],
    rear: [0, hh, hw],
    left: [-hw, 0, hh],
    right: [hw, 0, hh],
  };
  // Parts that sit under the hull edge (barrels, sensors) are drawn after the hull so they stay visible.
  out += `<rect x="${-hw}" y="${-hh}" width="${2 * hw}" height="${2 * hh}" rx="${rx}" fill="url(#${hullId})" stroke="${s.stroke}" stroke-width="2"/>`;
  out += `<path d="M${-hw + 5} ${-hh * 0.25}h${2 * hw - 10}M${-hw + 5} ${hh * 0.55}h${2 * hw - 10}" stroke="${s.stroke}" stroke-opacity="0.35" stroke-width="1"/>`;
  out += `<path d="M0 ${-hh}v${hh * 0.4}" stroke="${s.stroke}" stroke-opacity="0.5" stroke-width="1.5"/>`;

  const centre = slots.centre;
  if (centre) {
    const y = centre === 'battery' || centre === 'battery_plus' ? hh * 0.62 : hh * 0.1;
    out += `<g transform="translate(0 ${y})">${slotPart(centre, hw, s, glowId)}</g>`;
  }
  for (const slot of ['left', 'right', 'rear', 'front'] as const) {
    const part = slots[slot];
    if (!part) continue;
    const [ax, ay, edge] = anchors[slot];
    out += `<g transform="translate(${ax} ${ay}) rotate(${SLOT_ANGLE[slot]})">${slotPart(part, edge, s, glowId)}</g>`;
  }
  // Headlights / eyes on the front corners.
  const ex = hw - 5;
  out += `<circle cx="${-ex}" cy="${-hh + 4}" r="2" fill="${s.light}" filter="url(#${glowId})"/><circle cx="${ex}" cy="${-hh + 4}" r="2" fill="${s.light}" filter="url(#${glowId})"/>`;
  return out;
}

/** A composed top-down bot (chassis + drive + fitted part glyphs), facing up. */
export function botSvg(design: BotDesign, opts: BotSvgOptions): string {
  const h = botHalfExtent(design.chassis);
  const label = opts.team === 'player' ? 'Player bot' : 'Enemy bot';
  return svg(`${-h} ${-h} ${2 * h} ${2 * h}`, opts.size ?? 120, botBody(design, opts.team, opts.layer), ` role="img" aria-label="${label}"`);
}

// ---- Tiles and markers (Main.dc.html "Arena tiles & markers") ---------------------------------

export type MarkerKind = 'flag' | 'waypoint' | 'core';

export function markerSvg(kind: MarkerKind, size = 72, index?: number): string {
  switch (kind) {
    case 'flag':
      return svg('0 0 72 72', size, '<circle cx="36" cy="36" r="26" stroke-dasharray="4 4"/><path d="M28 54V18l20 8-20 8" fill="#5BE39A" fill-opacity="0.3"/>', ' stroke="#5BE39A" aria-hidden="true"');
    case 'waypoint':
      return svg(
        '0 0 72 72',
        size,
        `<circle cx="36" cy="36" r="14"/><circle cx="36" cy="36" r="24" stroke-dasharray="2 5"/><text x="36" y="41" fill="#3FD0E0" stroke="none" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="14">${index ?? ''}</text>`,
        ' stroke="#3FD0E0" aria-hidden="true"',
      );
    case 'core':
      return svg('0 0 72 72', size, '<path d="M36 14l18 10v24L36 58 18 48V24z" fill="#C792EA" fill-opacity="0.2"/><path d="M36 26l8 5v10l-8 5-8-5V31z"/>', ' stroke="#C792EA" aria-hidden="true"');
  }
}

/** Small terrain swatch for briefings / legends. */
export function tileSvg(terrain: Exclude<Terrain, 'floor'> | 'floor', size = 72): string {
  const id = nextId('t');
  const bodies: Record<Terrain, string> = {
    floor: `<rect width="72" height="72" fill="#121920" stroke="#26313D"/><circle cx="6" cy="6" r="1.8" fill="#2E3A47"/><circle cx="66" cy="6" r="1.8" fill="#2E3A47"/><circle cx="6" cy="66" r="1.8" fill="#2E3A47"/><circle cx="66" cy="66" r="1.8" fill="#2E3A47"/>`,
    wall: `<defs><pattern id="${id}" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="#141D27"/><rect width="6" height="12" fill="#1C2733"/></pattern></defs><rect x="1" y="1" width="70" height="70" fill="url(#${id})" stroke="#5B6B7C"/>`,
    lava: `<defs><radialGradient id="${id}" cx="0.4" cy="0.4"><stop offset="0" stop-color="#FF7A3D"/><stop offset="0.7" stop-color="#A3260F"/></radialGradient></defs><rect x="0.5" y="0.5" width="71" height="71" fill="url(#${id})" stroke="#FF7A3D"/>`,
    water: `<rect x="0.5" y="0.5" width="71" height="71" fill="#0F2A44" stroke="#2F7BBF"/><path d="M1 11h70M1 22h70M1 33h70M1 44h70M1 55h70M1 66h70" stroke="#1D4D7A" stroke-width="1"/>`,
    pit: `<rect x="1" y="1" width="70" height="70" fill="#000" stroke="#5B6B7C" stroke-dasharray="6 4"/>`,
    rough: `<defs><pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="2" fill="#4A5233"/></pattern></defs><rect x="0.5" y="0.5" width="71" height="71" fill="#1A1E14" stroke="#4A5233"/><rect x="0.5" y="0.5" width="71" height="71" fill="url(#${id})"/>`,
  };
  return svg('0 0 72 72', size, bodies[terrain], ' aria-hidden="true"');
}
