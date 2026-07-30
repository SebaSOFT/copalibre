/**
 * @copalibre/persistence — PostgreSQL authority for CopaLibre: Kysely
 * repositories (the only path to the database), the transactional outbox, and
 * the audit trail. No ORM lifecycle hooks: transaction boundaries, locking,
 * audit writes, and outbox writes are explicit, per the architecture doc.
 */

export type { Database } from './schema';
export { createDatabase, databaseConfigFromEnv, type DatabaseConfig } from './database';
export { newId } from './ids';

export {
  PersistenceError,
  InvariantViolationError,
  SchemaVersionMismatchError,
  NotFoundError,
} from './errors';

export { withTransaction, type UnitOfWork, type AuditEntry, type OutboxEvent } from './transaction';

export {
  MIGRATIONS,
  EXPECTED_SCHEMA_VERSION,
  createMigrator,
  migrateToLatest,
  migrateDownOneStep,
  readAppliedSchemaVersion,
  isSchemaReady,
} from './migrations';

export { AuditReader, type AuditRecord } from './audit';
export { OutboxReader, type OutboxRecord } from './outbox';

export {
  OrganizationRepository,
  type CreateOrganizationInput,
} from './repositories/organization-repository';
export {
  TournamentRepository,
  type CreateTournamentInput,
  type CreateRulesetInput,
} from './repositories/tournament-repository';
export { ParticipantRepository, type AuditContext } from './repositories/participant-repository';
export { CompetitionRepository } from './repositories/competition-repository';

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
} from './mapping';
