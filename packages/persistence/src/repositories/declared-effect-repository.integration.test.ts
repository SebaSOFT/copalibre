import { fixtureDescriptor } from '@copalibre/domain';
import { newId } from '../ids.js';
import { createMigratedDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';
import { withTransaction } from '../transaction.js';
import { CompetitionRepository } from './competition-repository.js';
import { DeclaredEffectRepository } from './declared-effect-repository.js';
import { OrganizationRepository } from './organization-repository.js';
import { TournamentRepository } from './tournament-repository.js';

const AUDIT = { actor: 'user:organizer-1', authorizationContext: 'scope:tournament.write' };

describe('declared effect ledger (integration)', () => {
  let scratch: ScratchDatabase;
  let organizationId = '';
  let matchId = '';
  let causeEventId = '';

  beforeAll(async () => {
    scratch = await createMigratedDatabase('declared-effects');
    const organizations = new OrganizationRepository(scratch.db);
    const tournaments = new TournamentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const descriptor = fixtureDescriptor({
      descriptorId: newId(),
      alias: 'declared-effects',
      version: '1.0.0',
    });

    const seeded = await withTransaction(scratch.db, async (uow) => {
      const organization = await organizations.create(uow, {
        alias: 'liga-declared-effects',
        name: 'Liga Declared Effects',
        ...AUDIT,
      });
      await tournaments.saveDescriptor(uow, descriptor, {
        organizationId: organization.organizationId,
        ...AUDIT,
      });
      const tournament = await tournaments.create(uow, {
        organizationId: organization.organizationId,
        alias: 'copa-declared-effects',
        name: 'Copa Declared Effects',
        descriptor,
        ...AUDIT,
      });
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Stage',
        format: 'round-robin',
        organizationId: organization.organizationId,
        ...AUDIT,
      });
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1 }],
        organizationId: organization.organizationId,
        ...AUDIT,
      });
      if (!fixture) throw new Error('Expected fixture');
      const match = await competition.createMatch(uow, {
        fixtureId: fixture.fixtureId,
        number: 1,
        organizationId: organization.organizationId,
        ...AUDIT,
      });
      const segment = await competition.createSegment(uow, {
        matchId: match.matchId,
        type: 'period',
        number: 1,
        organizationId: organization.organizationId,
        ...AUDIT,
      });
      const eventId = newId();
      await competition.appendEvent(uow, {
        event: {
          eventId,
          matchId: match.matchId,
          segmentId: segment.segmentId,
          definitionCode: 'event',
          occurredAt: '2026-08-24T12:00:00.000Z',
          payload: {},
        },
        sequence: 1,
        organizationId: organization.organizationId,
        ...AUDIT,
      });
      return { organizationId: organization.organizationId, matchId: match.matchId, eventId };
    });

    organizationId = seeded.organizationId;
    matchId = seeded.matchId;
    causeEventId = seeded.eventId;
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  it('inserts one effect per stable identity and preserves replay provenance', async () => {
    const repository = new DeclaredEffectRepository(scratch.db);
    const input = {
      identityKey: 'event.recorded:script-1:1:rule-1:action-1:event-1',
      organizationId,
      matchId,
      causeEventId,
      hook: 'event.recorded',
      scriptId: 'script-1',
      scriptVersion: 1,
      ruleId: 'rule-1',
      actionId: 'action-1',
      kind: 'notification',
      payload: { title: 'Match update' },
    };

    await expect(
      withTransaction(scratch.db, (uow) => repository.recordOnce(uow, input)),
    ).resolves.toBe(true);
    await expect(
      withTransaction(scratch.db, (uow) => repository.recordOnce(uow, input)),
    ).resolves.toBe(false);

    const stored = await repository.forCause(matchId, causeEventId);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject(input);
    expect(stored[0]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
