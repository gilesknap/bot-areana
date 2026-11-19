/** The v1 campaign: level data, play order and the unlock rules derived from it. */
import type { LevelDef } from '../shared/level';
import type { UnlockId } from '../shared/parts';
import type { Profile } from '../shared/save';
import { l01 } from './l01';
import { l02 } from './l02';
import { l03 } from './l03';
import { l04 } from './l04';
import { l05 } from './l05';
import { l06 } from './l06';
import { l07 } from './l07';
import { l08 } from './l08';
import { l09 } from './l09';
import { l10 } from './l10';

export const LEVELS: readonly LevelDef[] = [l01, l02, l03, l04, l05, l06, l07, l08, l09, l10];

export function getLevel(id: string): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}

/** Level 1 is always open; every other level opens once the one before it is cleared. */
export function isPlayable(profile: Pick<Profile, 'levels'>, id: string): boolean {
  const i = LEVELS.findIndex((l) => l.id === id);
  if (i < 0) return false;
  return i === 0 || !!profile.levels[LEVELS[i - 1]!.id]?.cleared;
}

/** Everything unlocked by the levels this profile can play. */
export function unlockedFor(profile: Pick<Profile, 'levels'>): Set<UnlockId> {
  return new Set(LEVELS.filter((l) => isPlayable(profile, l.id)).flatMap((l) => l.unlocks));
}
