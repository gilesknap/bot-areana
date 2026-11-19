/**
 * Pure save-data helpers: defaults, profiles, validation, export/import.
 * Nothing here touches IndexedDB (see db.ts) so it is easy to test.
 */
import type { BotDesign, ChassisId, DriveId, PartId, SlotId } from '../shared/parts';
import type { LevelProgress, PlaybackSpeed, Profile, SaveData } from '../shared/save';
import { SLOT_IDS } from '../shared/parts';
import { CHASSIS, PARTS } from '../parts/catalogue';

const SPEEDS: readonly PlaybackSpeed[] = [0.5, 1, 2, 4];

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}${idCounter}`;
}

export function newProfile(name: string): Profile {
  return {
    id: newId(),
    name: cleanName(name),
    createdAt: Date.now(),
    levels: {},
    designs: {},
    scripts: {},
    hintsShown: {},
    settings: { muted: false, speed: 1 },
  };
}

export function defaultSave(): SaveData {
  const profile = newProfile('Player');
  return { version: 1, activeProfileId: profile.id, profiles: [profile] };
}

function cleanName(name: string): string {
  return name.trim().slice(0, 24) || 'Player';
}

export function activeProfile(data: SaveData): Profile {
  return data.profiles.find((p) => p.id === data.activeProfileId) ?? data.profiles[0]!;
}

export function createProfile(data: SaveData, name: string): { data: SaveData; profile: Profile } {
  const profile = newProfile(name);
  return { data: { ...data, profiles: [...data.profiles, profile], activeProfileId: profile.id }, profile };
}

export function renameProfile(data: SaveData, id: string, name: string): SaveData {
  return { ...data, profiles: data.profiles.map((p) => (p.id === id ? { ...p, name: cleanName(name) } : p)) };
}

/** Deleting the last profile is refused (returns the data unchanged). */
export function deleteProfile(data: SaveData, id: string): SaveData {
  if (data.profiles.length <= 1) return data;
  const profiles = data.profiles.filter((p) => p.id !== id);
  const activeProfileId = data.activeProfileId === id ? profiles[0]!.id : data.activeProfileId;
  return { ...data, profiles, activeProfileId };
}

export function switchProfile(data: SaveData, id: string): SaveData {
  return data.profiles.some((p) => p.id === id) ? { ...data, activeProfileId: id } : data;
}

/** Fold one finished campaign run into the profile's progress (mutates the profile). */
export function recordResult(profile: Profile, levelId: string, won: boolean, stars: number, seconds: number): void {
  const prev = profile.levels[levelId] ?? { cleared: false, bestStars: 0, attempts: 0 };
  const next: LevelProgress = { ...prev, attempts: prev.attempts + 1 };
  if (won) {
    next.cleared = true;
    next.bestStars = Math.max(prev.bestStars, stars) as LevelProgress['bestStars'];
    next.bestSeconds = prev.bestSeconds === undefined ? seconds : Math.min(prev.bestSeconds, seconds);
  }
  profile.levels[levelId] = next;
}

// ---- Validation ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A well-formed design using known part ids, or null. (Budget/unlock checks are the Workshop's job.) */
export function parseDesign(v: unknown): BotDesign | null {
  if (!isObj(v) || typeof v.chassis !== 'string' || !(v.chassis in CHASSIS)) return null;
  const drive = v.drive;
  if (drive !== null && (typeof drive !== 'string' || !PARTS[drive as PartId]?.drive)) return null;
  if (!isObj(v.slots)) return null;
  const slots: Partial<Record<SlotId, PartId>> = {};
  for (const [slot, part] of Object.entries(v.slots)) {
    if (!SLOT_IDS.includes(slot as SlotId)) return null;
    if (part === undefined || part === null) continue;
    if (typeof part !== 'string' || !(part in PARTS)) return null;
    slots[slot as SlotId] = part as PartId;
  }
  return { chassis: v.chassis as ChassisId, drive: drive as DriveId | null, slots };
}

function parseProgress(v: unknown): LevelProgress | null {
  if (!isObj(v)) return null;
  const stars = Number(v.bestStars);
  const out: LevelProgress = {
    cleared: v.cleared === true,
    bestStars: ([0, 1, 2, 3].includes(stars) ? stars : 0) as LevelProgress['bestStars'],
    attempts: typeof v.attempts === 'number' && v.attempts >= 0 ? Math.floor(v.attempts) : 0,
  };
  if (typeof v.bestSeconds === 'number' && Number.isFinite(v.bestSeconds)) out.bestSeconds = v.bestSeconds;
  return out;
}

function parseRecord<T>(v: unknown, item: (x: unknown) => T | null): Record<string, T> {
  const out: Record<string, T> = {};
  if (!isObj(v)) return out;
  for (const [k, x] of Object.entries(v)) {
    const parsed = item(x);
    if (parsed !== null) out[k] = parsed;
  }
  return out;
}

function parseProfile(v: unknown): Profile | null {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id || typeof v.name !== 'string') return null;
  const settings = isObj(v.settings) ? v.settings : {};
  const speed = Number(settings.speed);
  return {
    id: v.id,
    name: cleanName(v.name),
    createdAt: typeof v.createdAt === 'number' ? v.createdAt : Date.now(),
    levels: parseRecord(v.levels, parseProgress),
    designs: parseRecord(v.designs, parseDesign),
    scripts: parseRecord(v.scripts, (s) => (typeof s === 'string' ? s : null)),
    hintsShown: parseRecord(v.hintsShown, (n) => (typeof n === 'number' && n >= 0 ? Math.floor(n) : null)),
    settings: {
      muted: settings.muted === true,
      speed: SPEEDS.includes(speed as PlaybackSpeed) ? (speed as PlaybackSpeed) : 1,
    },
  };
}

/** Validates and repairs stored or imported data; throws if it is not a Bot Arena save at all. */
export function parseSave(v: unknown): SaveData {
  if (!isObj(v) || v.version !== 1 || !Array.isArray(v.profiles)) {
    throw new Error("That file isn't a Bot Arena save.");
  }
  const profiles: Profile[] = [];
  for (const p of v.profiles) {
    const parsed = parseProfile(p);
    if (parsed && !profiles.some((q) => q.id === parsed.id)) profiles.push(parsed);
  }
  if (profiles.length === 0) throw new Error('That save has no usable profiles in it.');
  const active = profiles.find((p) => p.id === v.activeProfileId) ?? profiles[0]!;
  return { version: 1, activeProfileId: active.id, profiles };
}

export function exportSave(data: SaveData): string {
  return JSON.stringify(data, null, 2);
}

/** Parses an exported .json file. Throws an Error with a player-friendly message. */
export function importSave(json: string): SaveData {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("That file isn't a Bot Arena save (it isn't valid JSON).");
  }
  return parseSave(raw);
}
