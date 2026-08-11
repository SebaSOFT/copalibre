import type { Kysely } from 'kysely';
import { createScratchDatabase, createMigratedDatabase } from './scratch-database.js';
import { requirePostgresTestCapability, testDialectFromEnv } from './test-dialect.js';

interface TestDatabase {
  parent_test: { id: string };
  child_test: { id: string; parent_id: string; payload: unknown };
}

describe('persistence test dialect', () => {
  const originalDialect = process.env.COPALIBRE_TEST_DIALECT;

  afterEach(() => {
    if (originalDialect === undefined) delete process.env.COPALIBRE_TEST_DIALECT;
    else process.env.COPALIBRE_TEST_DIALECT = originalDialect;
  });

  it('defaults to PostgreSQL and rejects an unknown profile', () => {
    delete process.env.COPALIBRE_TEST_DIALECT;
    expect(testDialectFromEnv()).toBe('postgres');
    expect(() => testDialectFromEnv({ COPALIBRE_TEST_DIALECT: 'memory' })).toThrow(
      'Unsupported COPALIBRE_TEST_DIALECT',
    );
  });

  it('creates isolated SQLite state without DATABASE_URL, preserves JSON, and enforces foreign keys', async () => {
    process.env.COPALIBRE_TEST_DIALECT = 'sqlite';
    const scratch = await createScratchDatabase('sqlite-harness');
    try {
      const db = scratch.db as unknown as Kysely<TestDatabase>;
      expect(scratch.dialect).toBe('sqlite');
      await db.schema
        .createTable('parent_test')
        .addColumn('id', 'text', (column) => column.primaryKey())
        .execute();
      await db.schema
        .createTable('child_test')
        .addColumn('id', 'text', (column) => column.primaryKey())
        .addColumn('parent_id', 'text', (column) => column.notNull().references('parent_test.id'))
        .addColumn('payload', 'jsonb', (column) => column.notNull())
        .execute();
      await db.insertInto('parent_test').values({ id: 'parent' }).execute();
      await db
        .insertInto('child_test')
        .values({ id: 'child', parent_id: 'parent', payload: JSON.stringify({ value: 7 }) })
        .execute();

      const row = await db.selectFrom('child_test').selectAll().executeTakeFirstOrThrow();
      expect(row.payload).toEqual({ value: 7 });
      await expect(
        db
          .insertInto('child_test')
          .values({ id: 'orphan', parent_id: 'missing', payload: JSON.stringify({}) })
          .execute(),
      ).rejects.toThrow();
    } finally {
      await scratch.drop();
    }
  });

  it('applies portable forward migrations under SQLite', async () => {
    process.env.COPALIBRE_TEST_DIALECT = 'sqlite';
    const scratch = await createMigratedDatabase('sqlite-migration');
    try {
      await expect(scratch.db.introspection.getTables()).resolves.toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'organizations' })]),
      );
    } finally {
      await scratch.drop();
    }
  });

  it('rejects PostgreSQL-only capabilities before a SQLite concurrency test runs', async () => {
    process.env.COPALIBRE_TEST_DIALECT = 'sqlite';
    const scratch = await createScratchDatabase('sqlite-capabilities');
    try {
      expect(() => requirePostgresTestCapability(scratch.db, 'row locks')).toThrow(
        'row locks require PostgreSQL',
      );
    } finally {
      await scratch.drop();
    }
  });
});
