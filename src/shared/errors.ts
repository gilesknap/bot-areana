import type { BotErrorName } from './api';

/** Friendly text for the game's own Python exceptions. Shown as "Line N · Name: message" + tip. */
export const BOT_ERRORS: Readonly<Record<BotErrorName, { message: string; tip: string }>> = {
  BlasterNotReady: {
    message: 'the blaster is still cooling down.',
    tip: 'Tip: check bot.blaster.ready() before you fire.',
  },
  OutOfEnergy: {
    message: 'not enough energy for that.',
    tip: 'Tip: check bot.battery.level(), and bot.wait() a moment to recharge.',
  },
  PartNotFitted: {
    message: "your bot doesn't have that part fitted.",
    tip: 'Tip: fit it in the Workshop - only fitted parts exist on bot.',
  },
};

export const WATCHDOG_MESSAGE = 'Your bot was thinking too hard - loops need to do something!';
export const WATCHDOG_TIP = 'Tip: every loop should call the bot (move, scan, wait...) so time passes.';

/**
 * Thrown by SimMatch.call() for a game error. The Python layer re-raises it as the Python
 * exception class of the same name.
 */
export class BotApiError extends Error {
  constructor(
    readonly errorName: BotErrorName,
    message: string = BOT_ERRORS[errorName].message,
  ) {
    super(message);
    this.name = errorName;
  }
}

/**
 * Thrown by SimMatch.call() when the match ends mid-call (won, destroyed, time up).
 * The Python layer turns it into a BaseException the player's code cannot catch and stops quietly.
 */
export class MatchOver extends Error {
  constructor() {
    super('match over');
    this.name = 'MatchOver';
  }
}

/** A Python script error as shown in the console and editor. */
export interface ScriptError {
  /** Python exception class name, e.g. 'NameError', 'BlasterNotReady', or 'Watchdog'. */
  type: string;
  message: string;
  /** 1-based line in the player's script, if known. */
  line?: number;
  /** Sim tick when it happened (to sync with playback). */
  tick: number;
  /** Plain-English explanation for novices. */
  friendly: string;
  tip?: string;
}
