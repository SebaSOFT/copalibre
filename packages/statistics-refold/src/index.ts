/**
 * @copalibre/statistics-refold — wires `@copalibre/tournament-engine`'s fold
 * engine (`foldStatistics`/`aggregateTo`) to real persistence (0082).
 *
 * Neither package may do this itself: `@copalibre/persistence` is
 * deliberately fold-agnostic (`StatisticProjection`'s own doc comment —
 * `refold` is supplied by the caller, not built in), and
 * `@copalibre/tournament-engine` is deliberately database-free ("Pure: no
 * database, no HTTP", its own index.ts). This package is the orchestration
 * layer both `apps/worker`, `apps/api`, and `apps/copalibre`'s rebuild
 * command import from, instead of duplicating roster/context resolution in
 * each app.
 */

export {
  resolveMatchRoster,
  type EntrantRow,
  type MatchRoster,
  type MatchRosterInput,
  type PlayerRow,
  type RosterRow,
} from './actor-resolution.js';
export { mergeFigures } from './merge-figures.js';
export { buildRequiresTagFilter } from './tag-filter.js';
export { readRolledUp, type ActorMembership } from './rollup.js';
export { readRolledUpTotals, type RollupQuery } from './rollup-read.js';
export { createRefold, foldLiveEvent, resolveMatchFold, type MatchFoldContext } from './refold.js';
export {
  runStatisticsRebuild,
  type StatisticsRebuildOptions,
  type StatisticsRebuildResult,
} from './rebuild.js';
