import { CompetitionRepository } from './competition-repository.js';
import { MatchCommandIdempotencyRepository } from './match-command-idempotency-repository.js';
import { OrganizationRepository } from './organization-repository.js';
import { withTransaction } from '../transaction.js';
import { createMigratedDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';
import { newId } from '../ids.js';

/**
 * The console's key claim, against a real database: a claim commits with its command or not at
 * all, a second claim on one key fails, and the response is stored once.
 */

const AUDIT = { actor: 'user:official-1', authorizationContext: 'capability:match.control-clock' };

describe('MatchCommandIdempotencyRepository (integration)', () => {
  let scratch: ScratchDatabase;
  let organizationId: string;
  let tournamentId: string;
  let matchId: string;
  let repository: MatchCommandIdempotencyRepository;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('match-idempotency');
    repository = new MatchCommandIdempotencyRepository(scratch.db);
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'club-idempotency',
        name: 'Club Idempotency',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;
    tournamentId = newId();

    const competition = new CompetitionRepository(scratch.db);
    matchId = await withTransaction(scratch.db, async (uow) => {
      await uow.tx
        .insertInto('tournaments')
        .values({
          tournament_id: tournamentId,
          organization_id: organizationId,
          alias: 'copa-idempotency',
          name: 'Copa Idempotency',
          descriptor_id: newId(),
          descriptor_version: '1.0.0',
          ruleset_id: null,
          status: 'draft',
          started_at: null,
          profile_id: null,
          profile_version: null,
          created_at: new Date(),
        })
        .execute();
      const stage = await competition.createStageInTournament(uow, {
        tournamentId,
        number: 1,
        name: 'Stage idempotency',
        format: 'single-elimination',
        organizationId,
        ...AUDIT,
      });
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1 }],
        organizationId,
        ...AUDIT,
      });
      const match = await competition.createMatch(uow, {
        fixtureId: fixture?.fixtureId ?? '',
        number: 1,
        organizationId,
        ...AUDIT,
      });
      return match.matchId;
    });
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  function claimInput(idempotencyKey: string) {
    return {
      idempotencyKey,
      matchId,
      operation: 'end',
      requestFingerprint: 'fingerprint-a',
    };
  }

  it('stores a pending row for a claim', async () => {
    const key = newId();
    await withTransaction(scratch.db, (uow) => repository.claim(uow, claimInput(key)));

    await expect(repository.find(key)).resolves.toMatchObject({
      idempotencyKey: key,
      matchId,
      operation: 'end',
      requestFingerprint: 'fingerprint-a',
      response: {},
      responsePending: true,
    });
  });

  it('refuses a second claim on the same key', async () => {
    const key = newId();
    await withTransaction(scratch.db, (uow) => repository.claim(uow, claimInput(key)));

    await expect(
      withTransaction(scratch.db, (uow) => repository.claim(uow, claimInput(key))),
    ).rejects.toThrow();
  });

  it('leaves no row when the claiming transaction rolls back', async () => {
    const key = newId();
    await expect(
      withTransaction(scratch.db, async (uow) => {
        await repository.claim(uow, claimInput(key));
        throw new Error('the command was refused after its claim');
      }),
    ).rejects.toThrow('the command was refused after its claim');

    await expect(repository.find(key)).resolves.toBeUndefined();
  });

  it('stores a response on a pending claim once, and a second call changes nothing', async () => {
    const key = newId();
    await withTransaction(scratch.db, (uow) => repository.claim(uow, claimInput(key)));

    await repository.completeResponse(key, { status: 'in-progress' });
    await repository.completeResponse(key, { status: 'completed' });

    await expect(repository.find(key)).resolves.toMatchObject({
      response: { status: 'in-progress' },
      responsePending: false,
    });
  });

  it('stores a completed record through record', async () => {
    const key = newId();
    await withTransaction(scratch.db, (uow) =>
      repository.record(uow, {
        ...claimInput(key),
        response: { status: 'finalized' },
      }),
    );

    await expect(repository.find(key)).resolves.toMatchObject({
      response: { status: 'finalized' },
      responsePending: false,
    });
  });
});
