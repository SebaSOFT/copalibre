import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from './schema.js';

const pools = new WeakMap<Kysely<Database>, Pool>();

/** Counters belong to this database handle's process, never to the whole installation. */
export function databasePoolMetrics(db: Kysely<Database>) {
  const pool = pools.get(db);
  return pool
    ? { active: pool.totalCount - pool.idleCount, idle: pool.idleCount, waiting: pool.waitingCount }
    : undefined;
}

export interface DatabaseConfig {
  /** postgres://user:pass@host:port/db — always via env, never hardcoded. */
  readonly connectionString: string;
  readonly maxConnections?: number;
  /** Optional custom pool error handler; defaults to logging */
  readonly onPoolError?: (error: Error) => void;
  /** Optional pre-configured Pool instance (e.g. for testing) */
  readonly pool?: Pool;
}

export function createDatabase(config: DatabaseConfig): Kysely<Database> {
  const pool =
    config.pool ??
    new Pool({
      connectionString: config.connectionString,
      max: config.maxConnections ?? 10,
    });

  pool.on('error', (error: Error) => {
    if (config.onPoolError) {
      config.onPoolError(error);
    } else {
      console.error('PostgreSQL pool idle connection error:', error.message);
    }
  });

  const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });
  pools.set(db, pool);
  return db;
}

export function databaseConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  return { connectionString };
}
