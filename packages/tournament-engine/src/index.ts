/**
 * @copalibre/tournament-engine — deterministic fixture generation, standings and
 * advancement for the six MVP formats. Pure: no database, no HTTP.
 */

export type {
  BracketKind,
  SlotSource,
  GeneratedMatchBase,
  DuelMatch,
  PlacementMatch,
  GeneratedMatch,
  FixtureGraph,
  SeededEntrant,
  GenerateFixturesInput,
} from './types.js';
export { isDuelMatch, isPlacementMatch, slotsOf } from './types.js';
export {
  EngineError,
  UnsupportedFormatError,
  InvalidEntrantsError,
  AllocationError,
  QualificationError,
  DrawError,
  PlacementAdvancementError,
} from './errors.js';
export {
  evaluateConstraints,
  meetingRound,
  type ConstrainedEntrant,
  type DrawAssignment,
  type ConstraintViolation,
  type ConstraintEvaluation,
} from './constraints/index.js';
export {
  evaluateQualification,
  applyCutResolution,
  type QualificationInput,
  type QualificationOutcome,
  type ContestedCut,
  type CutResolution,
} from './qualification/index.js';
export {
  allocateSeeds,
  type AllocationEntrant,
  type AllocationInput,
  type AllocationOutcome,
} from './allocation/index.js';
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
