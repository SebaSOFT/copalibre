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
  TournamentRepository,
  type CreateTournamentInput,
  type CreateRulesetInput,
} from './repositories/tournament-repository.js';
export { ParticipantRepository, type AuditContext } from './repositories/participant-repository.js';
export { CompetitionRepository } from './repositories/competition-repository.js';
export { ScheduleRepository, type SchedulePreview } from './repositories/schedule-repository.js';
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
  toTournament,
  toParticipant,
  toTeam,
  toRoster,
  toEntrant,
  toStage,
  toMatch,
  toSegment,
  toRecordedEvent,
  toIsoString,
} from './mapping.js';
