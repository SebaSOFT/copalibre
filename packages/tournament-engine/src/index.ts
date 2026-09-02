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
  previewStageTransition,
  type StageTransitionInput,
  type StageTransitionPreview,
} from './transition/index.js';
export {
  runDraw,
  inspectDraw,
  type DrawRequest,
  type DrawOutcome,
  type DrawShape,
  type ScriptConstraintEvaluator,
} from './draw/index.js';
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
  evaluateGroupPromotion,
  validatePromotionPlan,
  type PromotionPlan,
  type PromotionPlanGroup,
  type QualifiedEntrant,
  type GroupPromotionOutcome,
} from './qualification/promotion.js';
export {
  allocateSeeds,
  drawGroups,
  drawZones,
  type AllocationEntrant,
  type AllocationInput,
  type AllocationOutcome,
} from './allocation/index.js';
export {
  assertSupportedFormat,
  isEliminationFormat,
  isRoundRobinFormat,
  isBracketGroupsFormat,
  isGauntletFormat,
} from './formats.js';
export {
  generateFixtures,
  generateGroupedFixtures,
  generateBracketGroups,
  resolveBracketGroupAdvancement,
  type BracketGroupQualification,
  generateGauntlet,
  projectGauntletStandings,
  computeGauntletStandings,
  type GauntletStandingRank,
  type GauntletStandingsResult,
  buildEliminationTree,
  buildDoubleElimination,
  buildRoundRobin,
  pruneEmptyMatches,
  seedSlotOrder,
  nextPowerOfTwo,
  type FixtureGroupInput,
  type GenerateGroupedFixturesInput,
  type ScopedGeneratedFixture,
} from './fixtures/index.js';
export {
  computeStandings,
  computeAccounting,
  computeScopedAccounting,
  computeCumulativeScores,
  toEntrantValues,
  entrantsInGraph,
  DEFAULT_POINTS,
  type PointsRules,
  type EntrantAccounting,
  type StandingsRow,
  type Standings,
  type CumulativeScoresResult,
} from './standings/index.js';
export {
  buildOpponentAdjacencyGraph,
  type OpponentAdjacencyGraph,
  type OpponentMatchRecord,
} from './standings/opponent-graph.js';
export {
  foldStatistics,
  aggregateTo,
  contributorsOf,
  orderForFold,
  type CollectedFigure,
  type FigureKey,
  type ActorContext,
  type CompetitionContext,
  type FoldInput,
  type FoldFact,
  type StatisticAdjustment,
} from './statistics/fold.js';
export { tagFactsFrom, type TagEventInput } from './statistics/tags.js';
export {
  projectTableLayout,
  type TableProjectionActor,
  type TableProjectionContext,
  type TableCell,
  type TableRow,
  type TableProjection,
} from './statistics/table-projection.js';
export {
  resolveAdvancement,
  advanceEntrants,
  unlockedByFinalization,
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
export {
  runEventRecordedCustomScripts,
  type CustomHookFailure,
  type EventRecordedHookInput,
  type EventRecordedHookResult,
} from './custom-hooks/event-recorded.js';
