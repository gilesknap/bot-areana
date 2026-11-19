/**
 * App-wide state: the loaded save plus debounced auto-save, and per-level context
 * (which design/script keys a screen reads and writes, budget, unlocked parts).
 */
import type { LevelDef } from '../shared/level';
import type { BotDesign, UnlockId } from '../shared/parts';
import type { Profile, SaveData } from '../shared/save';
import { activeProfile, saveSave } from '../save';
import { LEVELS, getLevel, unlockedFor } from '../levels';
import { setMuted } from '../audio';
import { defaultDesign, type Budget } from './workshopRules';

const SAVE_DELAY_MS = 600;

export class AppState {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();

  constructor(public data: SaveData) {
    setMuted(this.profile.settings.muted);
    // Best effort: write pending changes when the tab is hidden or closed.
    window.addEventListener('pagehide', () => this.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
  }

  get profile(): Profile {
    return activeProfile(this.data);
  }

  /** Call after mutating the profile; saves shortly afterwards. */
  changed(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), SAVE_DELAY_MS);
    for (const l of this.listeners) l();
  }

  /** Swap in new save data (import, profile switch) and save now. */
  replace(data: SaveData): void {
    this.data = data;
    setMuted(this.profile.settings.muted);
    this.changed();
    this.flush();
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    void saveSave(this.data).catch((e) => console.error('Save failed', e));
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  totalStars(): number {
    return Object.values(this.profile.levels).reduce((n, l) => n + l.bestStars, 0);
  }
}

/** What a Workshop or Code screen is working on. */
export interface LevelContext {
  level: LevelDef;
  free: boolean;
  /** undefined in free play: only the chassis weight limit applies. */
  budget: Budget | undefined;
  unlocked: ReadonlySet<UnlockId>;
  designKey: string;
  scriptKey: string;
}

export function levelContext(state: AppState, levelId: string, free: boolean): LevelContext | null {
  const level = getLevel(levelId);
  if (!level) return null;
  return {
    level,
    free,
    budget: free ? undefined : level.budget,
    unlocked: unlockedFor(state.profile),
    designKey: free ? 'free' : level.id,
    // Free play keeps one script per level so switching levels doesn't clobber your code.
    scriptKey: free ? `free:${level.id}` : level.id,
  };
}

/** The saved design, else the latest earlier level's design, else wheels on a small chassis. */
export function getDesign(state: AppState, ctx: LevelContext): BotDesign {
  const designs = state.profile.designs;
  if (designs[ctx.designKey]) return designs[ctx.designKey]!;
  if (ctx.free) return designs[ctx.level.id] ?? defaultDesign();
  const earlier = LEVELS.filter((l) => l.number < ctx.level.number && designs[l.id]).pop();
  return earlier ? designs[earlier.id]! : defaultDesign();
}

export function setDesign(state: AppState, ctx: LevelContext, design: BotDesign): void {
  state.profile.designs[ctx.designKey] = design;
  state.changed();
}

export function getScript(state: AppState, ctx: LevelContext): string {
  const scripts = state.profile.scripts;
  return scripts[ctx.scriptKey] ?? (ctx.free ? scripts[ctx.level.id] : undefined) ?? ctx.level.starter;
}

export function setScript(state: AppState, ctx: LevelContext, script: string): void {
  state.profile.scripts[ctx.scriptKey] = script;
  state.changed();
}
