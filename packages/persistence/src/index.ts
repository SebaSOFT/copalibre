/**
 * @copalibre/persistence — PostgreSQL authority for CopaLibre: Kysely
 * repositories (the only path to the database), the transactional outbox, and
 * the audit trail. No ORM lifecycle hooks: transaction boundaries, locking,
 * audit writes, and outbox writes are explicit, per the architecture doc.
 */

export type { Database } from './schema.js';
export { createDatabase, databaseConfigFromEnv, type DatabaseConfig } from './database.js';
export { newId } from './ids.js';

export {
  PersistenceError,
  InvariantViolationError,
  SchemaVersionMismatchError,
  NotFoundError,
} from './errors.js';

export {
  withTransaction,
  type UnitOfWork,
  type AuditEntry,
  type OutboxEvent,
} from './transaction.js';

export {
  MIGRATIONS,
  EXPECTED_SCHEMA_VERSION,
  createMigrator,
  migrateToLatest,
  migrateDownOneStep,
  readAppliedSchemaVersion,
  isSchemaReady,
} from './migrations/index.js';

export { AuditReader, type AuditRecord } from './audit.js';
export { OutboxReader, type OutboxRecord } from './outbox.js';

export {
  OrganizationRepository,
  type CreateOrganizationInput,
} from './repositories/organization-repository.js';
export {
  OrganizationAccessRepository,
  type AccessAuditContext,
  type AcceptOrganizationInvitationInput,
  type ChangeOrganizationRoleInput,
  type CreateOrganizationInvitationInput,
  type DeleteOrganizationRoleInput,
} from './repositories/organization-access-repository.js';
export { IdentityPrincipalRepository } from './repositories/identity-principal-repository.js';
export {
  TournamentRepository,
  type CreateTournamentInput,
  type CreateRulesetInput,
} from './repositories/tournament-repository.js';
export {
  EnrollmentRepository,
  type AuditContext,
  type ParticipantReportedResult,
  type ParticipantTeamMembership,
} from './repositories/enrollment-repository.js';
export { CompetitionRepository } from './repositories/competition-repository.js';
export { ScheduleRepository, type SchedulePreview } from './repositories/schedule-repository.js';
export { MatchAssignmentRepository } from './repositories/match-assignment-repository.js';
export {
  MatchCommandIdempotencyRepository,
  type StoredMatchCommandResponse,
} from './repositories/match-command-idempotency-repository.js';
export { PersonRepository } from './repositories/person-repository.js';
export {
  StatisticProjection,
  PROJECTED_EVENT_TYPES,
  type ProjectionEvent,
  type ProjectedEventType,
  type Refold,
  type ProjectionOutcome,
} from './projections/statistic-projection.js';
export {
  StageReadModel,
  type StageRecord,
  type StageMatchRecord,
} from './projections/stage-read-model.js';
export { TagRepository, type TagQuery } from './repositories/tag-repository.js';
export { AliasRepository, type AliasScopeName } from './repositories/alias-repository.js';
export {
  OutboxRelay,
  type ClaimedJob,
  type JobFailure,
  type DeadLetter,
  type RelayMetrics,
} from './relay/outbox-relay.js';
export { SchedulerLeaseStore, type Lease } from './relay/scheduler-lease.js';
export { ProjectionStore, type ProjectionVersion } from './relay/projection-store.js';
export {
  EventStreamReader,
  DEFAULT_REPLAY_WINDOW,
  type StreamQuery,
  type ReplayResolution,
  type ReplayWindow,
} from './relay/event-stream.js';
export {
  ScheduledJobStore,
  SYSTEM_ORGANIZATION,
  type ScheduledJob,
} from './relay/scheduled-jobs.js';
export {
  StatisticRepository,
  type StoredFigure,
  type TotalsQuery,
  type ReadTotal,
} from './repositories/statistic-repository.js';
/** Re-exported so an API layer can tell a caller's conflict from a fault. */
export { ScheduleConflictError } from '@copalibre/domain';
export {
  CompetitionRecordRepository,
  type StoredCompiledRuleset,
  type StandingsSnapshot,
  type StoredStandings,
} from './repositories/competition-record-repository.js';
export {
  TournamentProfileRepository,
  type StoredProfile,
} from './repositories/tournament-profile-repository.js';

export {
  toOrganization,
  toIdentityPrincipal,
  toOrganizationInvitation,
  toOrganizationRoleAssignment,
  toTournament,
  toTeam,
  toClub,
  toEntrant,
  toStage,
  toMatch,
  toSegment,
  toRecordedEvent,
  toIsoString,
} from './mapping.js';
