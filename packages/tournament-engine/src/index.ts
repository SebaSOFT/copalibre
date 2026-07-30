/**
 * @copalibre/tournament-engine — deterministic fixture generation, standings and
 * advancement for the six MVP formats. Pure: no database, no HTTP.
 */

export type {
  BracketKind,
  SlotSource,
  GeneratedMatch,
  FixtureGraph,
  SeededEntrant,
  GenerateFixturesInput,
} from './types.js';
export { EngineError, UnsupportedFormatError, InvalidEntrantsError } from './errors.js';
export { assertSupportedFormat, isEliminationFormat, isRoundRobinFormat } from './formats.js';
export {
  generateFixtures,
  buildEliminationTree,
  buildDoubleElimination,
  buildRoundRobin,
  pruneEmptyMatches,
  seedSlotOrder,
  nextPowerOfTwo,
} from './fixtures/index.js';
export {
  computeStandings,
  computeAccounting,
  toEntrantValues,
  entrantsInGraph,
  DEFAULT_POINTS,
  type PointsRules,
  type EntrantAccounting,
  type StandingsRow,
  type Standings,
} from './standings/index.js';
export {
  resolveAdvancement,
  playableMatches,
  type ResolvedSlot,
  type ResolvedMatch,
} from './advancement/index.js';
export {
  classifyEngineMutation,
  type EngineMutation,
  type EngineMutationContext,
  type ClassifiedMutation,
} from './mutation/index.js';
