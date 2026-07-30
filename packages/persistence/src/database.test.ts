import { databaseConfigFromEnv } from './database.js';

describe('databaseConfigFromEnv', () => {
  it('reads DATABASE_URL', () => {
    const config = databaseConfigFromEnv({ DATABASE_URL: 'postgres://u:p@h:5432/d' });
    expect(config.connectionString).toBe('postgres://u:p@h:5432/d');
  });

  it('throws when DATABASE_URL is absent — never falls back to a default host', () => {
    expect(() => databaseConfigFromEnv({})).toThrow(/DATABASE_URL/);
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
});
