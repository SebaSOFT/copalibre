import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classMethods,
  mutatesViaUnitOfWork,
  recordsAudit,
  uncoveredMutations,
  type RepositoryMethod,
} from './audit-coverage.js';

const REPO: RepositoryMethod = {
  name: 'createClub',
  body: [
    '  async createClub(',
    '    uow: UnitOfWork,',
    '    input: { readonly organizationId: string },',
    '  ): Promise<Club> {',
    "    const row = await uow.tx.insertInto('clubs').values({}).execute();",
    "    await uow.recordAudit({ action: 'club.created' });",
    '    return row;',
    '  }',
  ].join('\n'),
};

describe('classMethods', () => {
  it('extracts a method name and its full body', () => {
    const source = REPO.body;
    const [method] = classMethods(source);
    expect(method?.name).toBe('createClub');
    expect(method?.body).toContain('recordAudit');
  });

  it('skips the constructor', () => {
    const source = [
      'export class X {',
      '  constructor(private readonly db: Kysely<Database>) {}',
      '',
      '  async list(): Promise<void> {}',
      '}',
    ].join('\n');
    expect(classMethods(source).map((m) => m.name)).toEqual(['list']);
  });
});

describe('mutatesViaUnitOfWork / recordsAudit', () => {
  it('recognises a UnitOfWork-mutating, audited method', () => {
    expect(mutatesViaUnitOfWork(REPO)).toBe(true);
    expect(recordsAudit(REPO)).toBe(true);
  });

  it('does not flag a read-only method', () => {
    const method: RepositoryMethod = {
      name: 'find',
      body: [
        '  async find(id: string): Promise<Club | undefined> {',
        "    const row = await this.db.selectFrom('clubs').selectAll().executeTakeFirst();",
        '    return row ? toClub(row) : undefined;',
        '  }',
      ].join('\n'),
    };
    expect(mutatesViaUnitOfWork(method)).toBe(false);
  });

  it('does not flag a projection rebuild writing outside a UnitOfWork', () => {
    const method: RepositoryMethod = {
      name: 'rebuild',
      body: [
        '  async rebuild(): Promise<void> {',
        "    await this.db.updateTable('statistic_totals').set({}).execute();",
        '  }',
      ].join('\n'),
    };
    expect(mutatesViaUnitOfWork(method)).toBe(false);
  });

  it('flags a UnitOfWork mutation that records no audit entry', () => {
    const method: RepositoryMethod = {
      name: 'silentWrite',
      body: [
        '  async silentWrite(uow: UnitOfWork): Promise<void> {',
        "    await uow.tx.insertInto('clubs').values({}).execute();",
        '  }',
      ].join('\n'),
    };
    expect(mutatesViaUnitOfWork(method)).toBe(true);
    expect(recordsAudit(method)).toBe(false);
  });
});

describe('uncoveredMutations', () => {
  it('names the file and method of an unaudited mutation', () => {
    const files = new Map([
      [
        'example-repository.ts',
        [
          'export class ExampleRepository {',
          '  async silentWrite(uow: UnitOfWork): Promise<void> {',
          "    await uow.tx.insertInto('clubs').values({}).execute();",
          '  }',
          '}',
        ].join('\n'),
      ],
    ]);
    expect(uncoveredMutations(files)).toEqual([
      { file: 'example-repository.ts', method: 'silentWrite' },
    ]);
  });

  it('does not fire for an exception-listed method', () => {
    const files = new Map([
      [
        'match-command-idempotency-repository.ts',
        [
          'export class MatchCommandIdempotencyRepository {',
          '  async record(uow: UnitOfWork): Promise<void> {',
          "    await uow.tx.insertInto('match_command_idempotency').values({}).execute();",
          '  }',
          '}',
        ].join('\n'),
      ],
    ]);
    expect(uncoveredMutations(files)).toEqual([]);
  });

  it('does not fire for an audited mutation', () => {
    const files = new Map([['repo.ts', REPO.body.replace('  async createClub(', 'export class Repo {\n  async createClub(') + '\n}']]);
    expect(uncoveredMutations(files)).toEqual([]);
  });
});

describe('the real repository sources', () => {
  it('records an audit entry for every UnitOfWork-mutating method, or names its exception', () => {
    const repositoriesDir = join(dirname(fileURLToPath(import.meta.url)), 'repositories');
    const files = new Map(
      readdirSync(repositoriesDir)
        .filter((entry) => entry.endsWith('-repository.ts') && !entry.endsWith('.test.ts'))
        .map((entry) => [entry, readFileSync(join(repositoriesDir, entry), 'utf8')] as const),
    );
    expect(uncoveredMutations(files)).toEqual([]);
  });
});
