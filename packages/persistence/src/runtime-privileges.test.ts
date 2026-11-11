import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from 'kysely';
import type { Database } from './schema.js';
import {
  RUNTIME_PRIVILEGE_WARNING,
  runtimePrivilegeProblems,
  warnWhenRuntimeCredentialIsPrivileged,
} from './runtime-privileges.js';

/** A database that answers every query with `rows`, or fails with `error`. */
function fakeDatabase(rows: readonly Record<string, unknown>[], error?: Error): Kysely<Database> {
  const connection: DatabaseConnection = {
    async executeQuery<R>(): Promise<QueryResult<R>> {
      if (error) throw error;
      return { rows: rows as R[] };
    },
    // eslint-disable-next-line require-yield
    async *streamQuery() {
      throw new Error('not used');
    },
  };
  const driver: Driver = {
    init: async () => undefined,
    acquireConnection: async () => connection,
    beginTransaction: async () => undefined,
    commitTransaction: async () => undefined,
    rollbackTransaction: async () => undefined,
    releaseConnection: async () => undefined,
    destroy: async () => undefined,
  };
  return new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
}

const RUNTIME_ROLE_ROW = {
  role: 'copalibre_app',
  superuser: false,
  create_role: false,
  create_db: false,
  server_program: false,
  server_read: false,
  server_write: false,
  create_in_public: false,
  owned_in_public: 0,
};

describe('runtimePrivilegeProblems', () => {
  it('finds nothing for a role with row access only', async () => {
    expect(await runtimePrivilegeProblems(fakeDatabase([RUNTIME_ROLE_ROW]))).toEqual([]);
  });

  it.each([
    ['superuser', 'is a superuser'],
    ['create_role', 'can create roles'],
    ['create_db', 'can create databases'],
    ['server_program', 'can run programs on the database server'],
    ['server_read', 'can read files on the database server'],
    ['server_write', 'can write files on the database server'],
    ['create_in_public', 'can create objects in schema public'],
  ])('names %s as a problem', async (column, problem) => {
    const problems = await runtimePrivilegeProblems(
      fakeDatabase([{ ...RUNTIME_ROLE_ROW, [column]: true }]),
    );
    expect(problems).toEqual([`role "copalibre_app" ${problem}`]);
  });

  it('names objects the role owns', async () => {
    const problems = await runtimePrivilegeProblems(
      fakeDatabase([{ ...RUNTIME_ROLE_ROW, owned_in_public: 3 }]),
    );
    expect(problems).toEqual(['role "copalibre_app" owns 3 object(s) in schema public']);
  });
});

describe('warnWhenRuntimeCredentialIsPrivileged', () => {
  it('warns once, naming the problems and never the connection string', async () => {
    const warnings: string[] = [];
    await warnWhenRuntimeCredentialIsPrivileged(
      fakeDatabase([{ ...RUNTIME_ROLE_ROW, role: 'copalibre', superuser: true }]),
      (message) => warnings.push(message),
    );
    expect(warnings).toEqual([`${RUNTIME_PRIVILEGE_WARNING}: role "copalibre" is a superuser`]);
    expect(warnings[0]).not.toMatch(/postgres:\/\/|password/i);
  });

  it('stays silent for a role with row access only', async () => {
    const warnings: string[] = [];
    await warnWhenRuntimeCredentialIsPrivileged(fakeDatabase([RUNTIME_ROLE_ROW]), (message) =>
      warnings.push(message),
    );
    expect(warnings).toEqual([]);
  });

  it('stays silent when the check itself fails, so startup never depends on it', async () => {
    const warnings: string[] = [];
    await warnWhenRuntimeCredentialIsPrivileged(
      fakeDatabase([], new Error('connect ECONNREFUSED postgres://copalibre:secret@db/copalibre')),
      (message) => warnings.push(message),
    );
    expect(warnings).toEqual([]);
  });
});

describe('migrations', () => {
  it('create nothing outside schema public, which is all the runtime grants cover', () => {
    const directory = fileURLToPath(new URL('./migrations', import.meta.url));
    const offending = readdirSync(directory)
      .filter((file) => /^\d{4}-.*\.ts$/.test(file))
      .filter((file) =>
        /create\s+schema|createSchema\(/i.test(readFileSync(join(directory, file), 'utf8')),
      );
    expect(offending).toEqual([]);
  });
});
