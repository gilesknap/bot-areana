/** The deterministic simulation engine. See docs/architecture.md "Sim contract". */
import type { CreateMatch } from '../shared/protocol';
import { Match } from './match';

export const createMatch: CreateMatch = (opts) => new Match(opts);
export { Match } from './match';
