/**
 * Types for the per-part Python API spec (data in src/parts/api.ts). One spec drives the
 * Python `bot` object, editor autocomplete, the in-game API reference and the Workshop preview.
 */
import type { PartId, SlotId } from './parts';

export interface ApiParam {
  name: string;
  /** Python type as shown to players: 'float', 'bool', ... */
  type: string;
  /** Python literal for the default, e.g. 'True'. Absent = required. */
  default?: string;
  doc: string;
  /** `*values` style parameter. */
  variadic?: boolean;
}

/**
 * Simulated time a call costs:
 * - a number: that many ticks (0 = free);
 * - 'action': until the action completes when wait=True, otherwise 1 tick;
 * - 'seconds': the `seconds` argument converted to ticks (bot.wait).
 */
export type TickCost = number | 'action' | 'seconds';

export interface ApiMethod {
  name: string;
  params: readonly ApiParam[];
  /** Python return type as shown to players, e.g. 'float', 'list[ScanResult]', 'None'. */
  returns: string;
  /** One-line summary (autocomplete detail). */
  summary: string;
  /** Fuller explanation for the API reference. */
  doc: string;
  ticks: TickCost;
  /** Energy per call (continuous drains are documented in `doc`). */
  energy?: number;
  /** Python exceptions this can raise (names from BOT_ERRORS). */
  raises?: readonly BotErrorName[];
  example?: string;
}

/** Where a fitted part's API lives on `bot`. */
export interface PartApi {
  /** 'core' = methods directly on `bot` (always present). */
  part: PartId | 'core';
  summary: string;
  methods: readonly ApiMethod[];
}

/** Value object returned by radar.scan(). Python sees an object with these attributes. */
export interface ScanResult {
  kind: ScanKind;
  /** Relative bearing in degrees, (-180, 180], positive = to the right. */
  bearing: number;
  /** cm from the bot's centre */
  distance: number;
  x: number;
  y: number;
}

export type ScanKind = 'turret' | 'bot' | 'core' | 'flag' | 'waypoint';

/** Game-specific Python exceptions (all subclass `BotError`, which subclasses Exception). */
export type BotErrorName = 'BlasterNotReady' | 'OutOfEnergy' | 'PartNotFitted';

/** One entry on the `bot` object for a given design (see src/parts/naming.ts). */
export interface FittedApi {
  /** Python attribute name: 'drive', 'front_sensor', 'blaster', ... */
  attr: string;
  part: PartId;
  /** 'drive' for the drive train mount. */
  slot: SlotId | 'drive';
}
