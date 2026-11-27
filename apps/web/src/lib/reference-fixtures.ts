/**
 * The canonical review fixtures.
 *
 * One competition, told consistently, so the live match, the standings that
 * follow from it, the correction that amended it and the bracket it feeds are
 * the same story rather than four unrelated screenshots. A reviewer comparing
 * two compositions is then comparing presentation, not wondering why the scores
 * disagree.
 *
 * These are demonstrations, not records. They never reach a production surface:
 * the compositions that consume them read real projections, and the
 * workbench labels every value here as fixture data.
 *
 * Identifiers follow the repository's contract — UUIDv7 for entities, kebab-case
 * for aliases, and match display numbers (`M01`) as labels rather than as
 * anything a URL resolves.
 */

export { REFERENCE_ENTRANTS, referenceClubs } from './reference-fixtures/entrants.ts';
export {
  referenceSeries,
  referenceLiveDashboard,
  referenceBasketballDashboard,
  referenceTvLauncherAddress,
} from './reference-fixtures/live.ts';
export {
  referenceStandings,
  referenceStandingsTable,
  referenceWinnerZones,
} from './reference-fixtures/standings.ts';
export type {
  ReferenceStandingsRow,
  ReferenceStandingsTable,
} from './reference-fixtures/standings.ts';
export {
  referenceBracket,
  referenceJourneyBracket,
  referencePlacementBracket,
} from './reference-fixtures/brackets.ts';
export {
  referenceTimedMatchReportModel,
  referenceEmptyTimelineMatchReportModel,
  referenceRegisteredSquadMatchReportModel,
  referenceMatchReportModel,
} from './reference-fixtures/match-report.ts';
export { referencePlayerProfile } from './reference-fixtures/players.ts';
export {
  referenceTableLayouts,
  referenceTableProjection,
  referencePromotionTableProjection,
} from './reference-fixtures/tables.ts';
export {
  referenceGroupMatches,
  referenceUndecidedMatches,
  referenceScheduleRows,
  referenceSchedule,
} from './reference-fixtures/schedule.ts';
export {
  referenceAuditTrail,
  referenceTournamentListing,
  referenceOverview,
} from './reference-fixtures/listing.ts';
export type { ReferenceAuditEntry } from './reference-fixtures/listing.ts';
