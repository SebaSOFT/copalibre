import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from './schema.js';

export interface DatabaseConfig {
  /** postgres://user:pass@host:port/db — always via env, never hardcoded. */
  readonly connectionString: string;
  readonly maxConnections?: number;
}

export function createDatabase(config: DatabaseConfig): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: config.connectionString,
        max: config.maxConnections ?? 10,
      }),
    }),
  });
}

export function databaseConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  return { connectionString };
}
