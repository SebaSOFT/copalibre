import DatabaseConstructor from 'better-sqlite3';
import { Kysely, ParseJSONResultsPlugin, PostgresDialect, SqliteDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { createDatabase } from '../database.js';
import { migrateToLatest } from '../migrations/index.js';
import type { Database } from '../schema.js';
import {
  registerTestDatabase,
  testDialectFromEnv,
  type PersistenceTestDialect,
} from './test-dialect.js';

/**
 * Integration-test harness: each suite provisions its own scratch database on
 * the server pointed at by DATABASE_URL (docker-compose.dev.yml locally, a
 * service container in CI), so suites never share state.
 */

export interface ScratchDatabase {
  readonly db: Kysely<Database>;
  readonly dialect: PersistenceTestDialect;
  readonly connectionString: string;
  drop(): Promise<void>;
}

function adminConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Start Postgres with "docker compose -f docker-compose.dev.yml up -d postgres" and export DATABASE_URL.',
    );
  }
  return url;
}

export async function createScratchDatabase(label: string): Promise<ScratchDatabase> {
  if (testDialectFromEnv() === 'sqlite') return createSqliteScratchDatabase(label);
  return createPostgresScratchDatabase(label);
}

async function createPostgresScratchDatabase(label: string): Promise<ScratchDatabase> {
  const adminUrl = adminConnectionString();
  // Unquoted identifiers only: strip anything that is not [a-z0-9_].
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)
    .toString(36)
    .padStart(3, '0')}`;
  const name = `copalibre_test_${safeLabel}_${suffix}`.toLowerCase();

  const admin = new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString: adminUrl, max: 1 }) }),
  });
  await sql.raw(`create database ${name}`).execute(admin);
  await admin.destroy();

  const scratchUrl = replaceDatabaseName(adminUrl, name);
  const db = registerTestDatabase(
    createDatabase({ connectionString: scratchUrl, maxConnections: 4 }),
    'postgres',
  );

  return {
    db,
    dialect: 'postgres',
    connectionString: scratchUrl,
    async drop() {
      await db.destroy();
      const cleanup = new Kysely<Database>({
        dialect: new PostgresDialect({ pool: new Pool({ connectionString: adminUrl, max: 1 }) }),
      });
      await sql.raw(`drop database if exists ${name} with (force)`).execute(cleanup);
      await cleanup.destroy();
    },
  };
}

function createSqliteScratchDatabase(label: string): ScratchDatabase {
  const sqlite = new DatabaseConstructor(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.function('now', () => new Date().toISOString());
  const db = registerTestDatabase(
    new Kysely<Database>({
      dialect: new SqliteDialect({ database: sqliteDriverWithDateBindings(sqlite) }),
      plugins: [new ParseJSONResultsPlugin()],
    }),
    'sqlite',
  );

  return {
    db,
    dialect: 'sqlite',
    connectionString: `sqlite::memory:${label}`,
    async drop() {
      await db.destroy();
    },
  };
}

/** Kysely's SQLite dialect delegates bindings to better-sqlite3, which has no Date binding. */
function sqliteDriverWithDateBindings(database: DatabaseConstructor.Database) {
  return {
    close: () => database.close(),
    prepare(query: string) {
      const statement = database.prepare(query);
      const bind = (parameters: readonly unknown[]) =>
        parameters.map((parameter) =>
          parameter instanceof Date ? parameter.toISOString() : parameter,
        );
      return {
        reader: statement.reader,
        all: (parameters: readonly unknown[]) => statement.all(bind(parameters)),
        run: (parameters: readonly unknown[]) => statement.run(bind(parameters)),
        iterate: (parameters: readonly unknown[]) => statement.iterate(bind(parameters)),
      };
    },
  };
}

/** Scratch database with every migration already applied. */
export async function createMigratedDatabase(label: string): Promise<ScratchDatabase> {
  const scratch = await createScratchDatabase(label);
  const { error } = await migrateToLatest(scratch.db);
  if (error) {
    await scratch.drop();
    if (scratch.dialect === 'sqlite') {
      throw new Error(
        `SQLite portable migration setup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    throw error;
  }
  return scratch;
}

function replaceDatabaseName(connectionString: string, name: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${name}`;
  return url.toString();
}
