import { jest } from '@jest/globals';
import { databaseConfigFromEnv } from './database.js';

describe('databaseConfigFromEnv', () => {
  it('reads DATABASE_URL', () => {
    const config = databaseConfigFromEnv({ DATABASE_URL: 'postgres://u:p@h:5432/d' });
    expect(config.connectionString).toBe('postgres://u:p@h:5432/d');
  });

  it('throws when DATABASE_URL is absent — never falls back to a default host', () => {
    expect(() => databaseConfigFromEnv({})).toThrow(/DATABASE_URL/);
  });

  it('falls back to process.env when no env parameter is provided', () => {
    const original = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = 'postgres://u:p@env-host:5432/db';
      const config = databaseConfigFromEnv();
      expect(config.connectionString).toBe('postgres://u:p@env-host:5432/db');
    } finally {
      if (original !== undefined) {
        process.env.DATABASE_URL = original;
      } else {
        delete process.env.DATABASE_URL;
      }
    }
  });
});

describe('createDatabase', () => {
  it('builds a Kysely instance with the default pool size', async () => {
    const { createDatabase } = await import('./database.js');
    const db = createDatabase({ connectionString: 'postgres://u:p@127.0.0.1:1/db' });
    expect(typeof db.selectFrom).toBe('function');
    await db.destroy();
  });

  it('honors an explicit maxConnections', async () => {
    const { createDatabase } = await import('./database.js');
    const db = createDatabase({
      connectionString: 'postgres://u:p@127.0.0.1:1/db',
      maxConnections: 3,
    });
    expect(typeof db.transaction).toBe('function');
    await db.destroy();
  });

  it('handles idle pool error events and delegates to onPoolError without throwing', async () => {
    const { Pool } = await import('pg');
    const { createDatabase } = await import('./database.js');
    const pool = new Pool({ connectionString: 'postgres://u:p@127.0.0.1:1/db' });
    const onPoolError = jest.fn();
    const db = createDatabase({
      connectionString: 'postgres://u:p@127.0.0.1:1/db',
      pool,
      onPoolError,
    });

    const error = new Error('terminating connection due to administrator command');
    expect(() => {
      pool.emit('error', error);
    }).not.toThrow();

    expect(onPoolError).toHaveBeenCalledWith(error);
    await db.destroy();
  });

  it('logs pool errors to console.error by default when onPoolError is omitted', async () => {
    const { Pool } = await import('pg');
    const { createDatabase } = await import('./database.js');
    const pool = new Pool({ connectionString: 'postgres://u:p@127.0.0.1:1/db' });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const db = createDatabase({
      connectionString: 'postgres://u:p@127.0.0.1:1/db',
      pool,
    });

    const error = new Error('connection reset by peer');
    expect(() => {
      pool.emit('error', error);
    }).not.toThrow();

    expect(consoleSpy).toHaveBeenCalledWith(
      'PostgreSQL pool idle connection error:',
      'connection reset by peer',
    );
    consoleSpy.mockRestore();
    await db.destroy();
  });
});
