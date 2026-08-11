import type { Kysely } from 'kysely';
import type { Database } from '../schema.js';

export type PersistenceTestDialect = 'postgres' | 'sqlite';

export interface PersistenceTestCapabilities {
  readonly dialect: PersistenceTestDialect;
  readonly supportsRowLocks: boolean;
  readonly supportsProductionMigrations: boolean;
}

const POSTGRES_CAPABILITIES: PersistenceTestCapabilities = {
  dialect: 'postgres',
  supportsRowLocks: true,
  supportsProductionMigrations: true,
};

const SQLITE_CAPABILITIES: PersistenceTestCapabilities = {
  dialect: 'sqlite',
  supportsRowLocks: false,
  supportsProductionMigrations: false,
};

const capabilitiesByDatabase = new WeakMap<object, PersistenceTestCapabilities>();

export function testDialectFromEnv(env: NodeJS.ProcessEnv = process.env): PersistenceTestDialect {
  const configured = env.COPALIBRE_TEST_DIALECT ?? 'postgres';
  if (configured === 'postgres' || configured === 'sqlite') return configured;
  throw new Error(
    `Unsupported COPALIBRE_TEST_DIALECT "${configured}"; expected "postgres" or "sqlite"`,
  );
}

export function registerTestDatabase(
  db: Kysely<Database>,
  dialect: PersistenceTestDialect,
): Kysely<Database> {
  capabilitiesByDatabase.set(
    db,
    dialect === 'postgres' ? POSTGRES_CAPABILITIES : SQLITE_CAPABILITIES,
  );
  return db;
}

export function testCapabilities(db: Kysely<Database>): PersistenceTestCapabilities {
  return capabilitiesByDatabase.get(db) ?? POSTGRES_CAPABILITIES;
}

export function requirePostgresTestCapability(
  db: Kysely<Database>,
  capability: 'row locks' | 'production migrations' | 'transactional outbox',
): void {
  if (testCapabilities(db).dialect === 'postgres') return;
  throw new Error(`${capability} require PostgreSQL; SQLite fast tests are not equivalent`);
}
