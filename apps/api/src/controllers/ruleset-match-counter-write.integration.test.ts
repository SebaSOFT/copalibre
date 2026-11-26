import { footballDescriptor, compileEffectiveRuleset } from '@copalibre/domain';
import { TournamentRepository, withTransaction, type Database } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { buildTestApp } from './test-support/integration-harness.js';
import { StagesController } from './stages.controller.js';
import { TournamentsController } from './tournaments.controller.js';

/**
 * A match counter override is validated when a ruleset is saved, and never when it is read: a stored
 * ruleset with a malformed entry still compiles, its other overrides apply, and the entry is skipped.
 */
let scratch: Awaited<ReturnType<typeof buildTestApp>>['scratch'];
let app: Awaited<ReturnType<typeof buildTestApp>>['app'];
let organizationId = '';
let counter = 0;

beforeAll(async () => {
  ({ app, scratch, organizationId } = await buildTestApp([
    TournamentsController,
    StagesController,
  ]));
});

afterAll(async () => {
  await app?.close();
  await scratch?.drop();
});

async function seed() {
  counter += 1;
  const tournaments = new TournamentRepository(scratch.db);
  const base = footballDescriptor();
  const descriptor = {
    ...base,
    matchCounters: [
      {
        code: 'team-fouls',
        label: 'Team fouls',
        shortLabel: 'F',
        events: [base.eventDefinitions[0]?.code ?? ''],
        scope: 'match' as const,
      },
    ],
  };
  const tournamentId = await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
    await tournaments.saveDescriptor(uow, descriptor, {
      organizationId,
      actor: 'user:seed',
      authorizationContext: 'seed',
    });
    const tournament = await tournaments.create(uow, {
      organizationId,
      alias: `copa-contadores-${counter}`,
      name: 'Copa Contadores',
      descriptor,
      actor: 'user:seed',
      authorizationContext: 'seed',
    });
    return tournament.tournamentId;
  });
  return { tournaments, descriptor, tournamentId };
}

describe('match counter override on ruleset save and read', () => {
  it('refuses a malformed matchCounters override on save, with the violation', async () => {
    const { tournaments, descriptor, tournamentId } = await seed();
    const attempt = withTransaction(scratch.db as Kysely<Database>, (uow) =>
      tournaments.createRuleset(uow, {
        tournamentId,
        organizationId,
        descriptor,
        overrides: { matchCounters: { 'team-fouls': null } },
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    const error: unknown = await attempt.then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as { details?: unknown }).details).toMatchObject({
      violations: [expect.objectContaining({ field: 'matchCounters', reason: 'invalid-override' })],
    });
  });

  it('reports a matchCounters problem together with every other violation of the same save', async () => {
    const { tournaments, descriptor, tournamentId } = await seed();
    const error: unknown = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      tournaments.createRuleset(uow, {
        tournamentId,
        organizationId,
        descriptor,
        overrides: { matchCounters: { 'team-fouls': { hidden: 'yes' } }, unknownField: 1 },
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    ).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    const violations = (error as { details?: { violations?: readonly { field: string }[] } })
      .details?.violations;
    expect(violations?.map((violation) => violation.field)).toEqual(
      expect.arrayContaining(['matchCounters', 'unknownField']),
    );
  });

  it('compiles a stored ruleset with an invalid matchCounters entry, keeping its segment overrides', async () => {
    const { tournaments, descriptor, tournamentId } = await seed();
    await withTransaction(scratch.db as Kysely<Database>, (uow) =>
      tournaments.createRuleset(uow, {
        tournamentId,
        organizationId,
        descriptor,
        overrides: { 'scoring.pointsPerWin': 3 },
        actor: 'user:seed',
        authorizationContext: 'seed',
      }),
    );
    // A row written before the rule existed, or by another path: the write check never saw it.
    await scratch.db
      .updateTable('tournament_rulesets')
      .set({
        overrides: JSON.stringify({
          'scoring.pointsPerWin': 5,
          matchCounters: { 'team-fouls': { allowance: -3 } },
        }),
      })
      .where('tournament_id', '=', tournamentId)
      .execute();

    const stored = await tournaments.findLatestRuleset(tournamentId);
    expect(stored).not.toBeNull();
    const compiled = compileEffectiveRuleset(descriptor, stored ?? undefined);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.value.config).toMatchObject({ scoring: { pointsPerWin: 5 } });
  });
});
