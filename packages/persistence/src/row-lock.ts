import type { Kysely } from 'kysely';
import type { Database } from './schema.js';
import { testCapabilities } from './test-support/test-dialect.js';

/**
 * PostgreSQL row locks protect production mutations. SQLite fast tests exercise
 * serial repository behavior only and must not be mistaken for concurrency tests.
 */
export function lockRowsForMutation<T extends { forUpdate(): T }>(
  db: Kysely<Database>,
  query: T,
): T {
  return testCapabilities(db).supportsRowLocks ? query.forUpdate() : query;
}
