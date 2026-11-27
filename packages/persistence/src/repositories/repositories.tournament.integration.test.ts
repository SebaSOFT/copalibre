import { type MatchResult } from '@copalibre/domain';
import { AuditReader } from '../audit.js';
import { InvariantViolationError } from '../errors.js';
import { newId } from '../ids.js';
import { OutboxReader } from '../outbox.js';
import { type ScratchDatabase } from '../test-support/scratch-database.js';
import { withTransaction } from '../transaction.js';
import { CompetitionRepository } from './competition-repository.js';
import { PersonRepository } from './person-repository.js';
import { EnrollmentRepository } from './enrollment-repository.js';
import { TournamentRepository } from './tournament-repository.js';
import {
  startRepositoriesFixture,
  AUDIT,
  descriptor,
} from './repositories.integration-fixtures.js';

describe('repositories (integration)', () => {
  let scratch: ScratchDatabase;
  let tournaments: TournamentRepository;
  let participants: EnrollmentRepository;
  let competition: CompetitionRepository;
  let organizationId: string;

  beforeAll(async () => {
    const fixture = await startRepositoriesFixture();
    scratch = fixture.scratch;
    tournaments = fixture.tournaments;
    participants = fixture.participants;
    competition = fixture.competition;
    organizationId = fixture.organizationId;
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  it('resolves a tournament by its organization-scoped alias (URL contract path)', async () => {
    const disciplineDescriptor = descriptor();
    const tournament = await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, disciplineDescriptor, {
        organizationId,
        ...AUDIT,
      });
      return tournaments.create(uow, {
        organizationId,
        alias: 'copa-orbital-2026',
        name: 'Copa Orbital 2026',
        descriptor: disciplineDescriptor,
        ...AUDIT,
      });
    });

    await expect(
      tournaments.findByScopedAlias('liga-orbital', 'copa-orbital-2026'),
    ).resolves.toMatchObject({ tournamentId: tournament.tournamentId });
    // A tournament alias is only unique within its organization, so an
    // unscoped lookup must not be possible — there is no such method.
    await expect(
      tournaments.findByScopedAlias('another-org', 'copa-orbital-2026'),
    ).resolves.toBeUndefined();
  });

  describe('lifecycle events that notification email is built on', () => {
    async function eventsOf(eventType: string, entityId: string) {
      const rows = await scratch.db
        .selectFrom('outbox_events')
        .select(['payload', 'stream'])
        .where('event_type', '=', eventType)
        .where('entity_id', '=', entityId)
        .execute();
      return rows.map((row) => ({
        stream: row.stream,
        payload: row.payload as Record<string, unknown>,
      }));
    }

    it('publishes club.created with the club and its actor, flagging an import', async () => {
      const [direct, imported] = await withTransaction(scratch.db, async (uow) => [
        await participants.createClub(uow, { organizationId, name: 'Club Directo', ...AUDIT }),
        await participants.createClub(uow, {
          organizationId,
          name: 'Club Importado',
          origin: 'import',
          ...AUDIT,
        }),
      ]);

      const [event] = await eventsOf('club.created', direct.clubId);
      expect(event?.payload).toEqual({
        clubId: direct.clubId,
        alias: direct.alias,
        name: 'Club Directo',
        actor: AUDIT.actor,
      });
      const [importedEvent] = await eventsOf('club.created', imported.clubId);
      expect(importedEvent?.payload).toMatchObject({ origin: 'import' });
    });

    it('publishes no club.created when the creating transaction rolls back', async () => {
      let clubId = '';
      await expect(
        withTransaction(scratch.db, async (uow) => {
          clubId = (
            await participants.createClub(uow, { organizationId, name: 'Club Fantasma', ...AUDIT })
          ).clubId;
          throw new Error('rolled back');
        }),
      ).rejects.toThrow('rolled back');
      expect(await eventsOf('club.created', clubId)).toHaveLength(0);
    });

    it('extends tournament.created and entrant.registered without removing a field', async () => {
      const disciplineDescriptor = descriptor();
      const { tournament, entrant } = await withTransaction(scratch.db, async (uow) => {
        await tournaments.saveDescriptor(uow, disciplineDescriptor, { organizationId, ...AUDIT });
        const created = await tournaments.create(uow, {
          organizationId,
          alias: 'copa-aviso-importada',
          name: 'Copa Aviso Importada',
          descriptor: disciplineDescriptor,
          origin: 'import',
          ...AUDIT,
        });
        const team = await participants.createTeam(uow, {
          organizationId,
          name: 'Equipo Eventos',
          ...AUDIT,
        });
        const registered = await participants.registerEntrant(uow, {
          tournamentId: created.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          organizationId,
          origin: 'club-portal',
          ...AUDIT,
        });
        return { tournament: created, entrant: registered };
      });

      const [tournamentEvent] = await eventsOf('tournament.created', tournament.tournamentId);
      expect(tournamentEvent?.payload).toEqual({
        tournamentId: tournament.tournamentId,
        alias: 'copa-aviso-importada',
        includesMinors: false,
        showYouthProfiles: false,
        status: 'draft',
        name: 'Copa Aviso Importada',
        actor: AUDIT.actor,
        origin: 'import',
      });
      const [entrantEvent] = await eventsOf('entrant.registered', entrant.entrantId);
      expect(entrantEvent?.payload).toEqual({
        entrantId: entrant.entrantId,
        tournamentId: tournament.tournamentId,
        status: 'pending',
        entrantKind: 'team',
        actor: AUDIT.actor,
        origin: 'club-portal',
      });
    });

    it('leaves origin out of the payload when the mutation was a direct operator action', async () => {
      const disciplineDescriptor = descriptor();
      const tournament = await withTransaction(scratch.db, async (uow) => {
        await tournaments.saveDescriptor(uow, disciplineDescriptor, { organizationId, ...AUDIT });
        return tournaments.create(uow, {
          organizationId,
          alias: 'copa-aviso-directa',
          name: 'Copa Aviso Directa',
          descriptor: disciplineDescriptor,
          ...AUDIT,
        });
      });
      const [event] = await eventsOf('tournament.created', tournament.tournamentId);
      expect(event?.payload).not.toHaveProperty('origin');
    });
  });

  it('compiles the effective ruleset before persisting a ruleset version', async () => {
    const disciplineDescriptor = descriptor();
    const tournament = await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, disciplineDescriptor, { organizationId, ...AUDIT });
      return tournaments.create(uow, {
        organizationId,
        alias: 'copa-compilable',
        name: 'Copa Compilable',
        descriptor: disciplineDescriptor,
        ...AUDIT,
      });
    });

    const { ruleset, effective } = await withTransaction(scratch.db, (uow) =>
      tournaments.createRuleset(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        descriptor: disciplineDescriptor,
        overrides: { 'scoring.pointsPerWin': 2, tiebreakers: ['goal-difference'] },
        ...AUDIT,
      }),
    );

    expect(ruleset.version).toBe(1);
    expect(effective.config).toMatchObject({
      scoring: { pointsPerWin: 2 },
      tiebreakers: ['points', 'goal-difference'],
    });
    expect(effective.compiledFrom.descriptorVersion).toBe('1.0.0');
  });

  it('refuses a forbidden override without writing a ruleset row', async () => {
    const disciplineDescriptor = descriptor();
    const tournament = await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, disciplineDescriptor, { organizationId, ...AUDIT });
      return tournaments.create(uow, {
        organizationId,
        alias: 'copa-forbidden',
        name: 'Copa Forbidden',
        descriptor: disciplineDescriptor,
        ...AUDIT,
      });
    });

    await expect(
      withTransaction(scratch.db, (uow) =>
        tournaments.createRuleset(uow, {
          tournamentId: tournament.tournamentId,
          organizationId,
          descriptor: disciplineDescriptor,
          overrides: { 'identityRules.federationCode': 'HACK-9' },
          ...AUDIT,
        }),
      ),
    ).rejects.toBeInstanceOf(InvariantViolationError);

    const rulesets = await scratch.db
      .selectFrom('tournament_rulesets')
      .selectAll()
      .where('tournament_id', '=', tournament.tournamentId)
      .execute();
    expect(rulesets).toHaveLength(0);
  });

  it('records a match result exactly once and refuses a silent overwrite', async () => {
    const disciplineDescriptor = descriptor();
    const { matchId, entrantId } = await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, disciplineDescriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-resultado',
        name: 'Copa Resultado',
        descriptor: disciplineDescriptor,
        ...AUDIT,
      });
      const team = await participants.createTeam(uow, {
        organizationId,
        name: 'Equipo Orbital',
        ...AUDIT,
      });
      const entrant = await participants.registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'team', teamId: team.teamId },
        organizationId,
        ...AUDIT,
      });
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Group Stage',
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      });
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1, homeEntrantId: entrant.entrantId }],
        organizationId,
        ...AUDIT,
      });
      if (!fixture) throw new Error('fixture was not created');
      const match = await competition.createMatch(uow, {
        fixtureId: fixture.fixtureId,
        number: 1,
        organizationId,
        ...AUDIT,
      });
      return { matchId: match.matchId, entrantId: entrant.entrantId };
    });

    const result: MatchResult = {
      sides: [{ entrantId, statistics: { score: 3 } }],
      winnerEntrantId: entrantId,
      recordedAt: '2026-07-29T14:00:00.000Z',
    };

    const finalized = await withTransaction(scratch.db, (uow) =>
      competition.recordResult(uow, { matchId, result, organizationId, ...AUDIT }),
    );
    expect(finalized.status).toBe('finalized');
    expect(finalized.result?.sides).toEqual([{ entrantId, statistics: { score: 3 } }]);

    // Second attempt: the no-overwrite product contract.
    await expect(
      withTransaction(scratch.db, (uow) =>
        competition.recordResult(uow, {
          matchId,
          result: { ...result, sides: [{ entrantId, statistics: { score: 99 } }] },
          organizationId,
          ...AUDIT,
        }),
      ),
    ).rejects.toThrow(/audited correction workflow/);

    // The stored result is unchanged.
    await expect(competition.findMatch(matchId)).resolves.toMatchObject({
      result: { sides: [{ entrantId, statistics: { score: 3 } }] },
    });

    const audit = await new AuditReader(scratch.db).historyFor('match', matchId);
    expect(audit.map((entry) => entry.action)).toEqual(['match.created', 'match.finalized']);
    expect(audit[1]?.previousState).toMatchObject({ result: null });
  });

  it('appends match events in sequence and exposes them in order', async () => {
    const disciplineDescriptor = descriptor();
    const { matchId, segmentId, personId } = await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, disciplineDescriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-eventos',
        name: 'Copa Eventos',
        descriptor: disciplineDescriptor,
        ...AUDIT,
      });
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Stage',
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      });
      const [fixture] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1 }],
        organizationId,
        ...AUDIT,
      });
      if (!fixture) throw new Error('fixture was not created');
      const match = await competition.createMatch(uow, {
        fixtureId: fixture.fixtureId,
        number: 1,
        organizationId,
        ...AUDIT,
      });
      const segment = await competition.createSegment(uow, {
        matchId: match.matchId,
        type: 'half',
        number: 1,
        organizationId,
        ...AUDIT,
      });
      const { person: player } = await new PersonRepository(scratch.db).register(uow, {
        organizationId,
        displayName: 'Atacante Uno',
        ...AUDIT,
      });
      return {
        matchId: match.matchId,
        segmentId: segment.segmentId,
        personId: player.personId,
      };
    });

    for (const zone of ['inner', 'outer', 'inner']) {
      const sequence = await competition.nextEventSequence(matchId);
      await withTransaction(scratch.db, (uow) =>
        competition.appendEvent(uow, {
          event: {
            eventId: newId(),
            matchId,
            segmentId,
            definitionCode: 'strike',
            occurredAt: new Date().toISOString(),
            side: 'entrant-atlas',
            personId,
            payload: { zone },
          },
          sequence,
          organizationId,
          ...AUDIT,
        }),
      );
    }

    const events = await competition.listEvents(matchId);
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3]);
    expect(events.map((event) => event.payload.zone)).toEqual(['inner', 'outer', 'inner']);

    // Each append published an outbox event in the same commit.
    const outboxCount = await new OutboxReader(scratch.db).countFor(matchId);
    expect(outboxCount).toBeGreaterThanOrEqual(3);

    // The outbox payload carries matchId/side/personId/occurredAt
    // alongside eventId/definitionCode — every field `PUBLIC_EVENT_FIELDS`
    // allowlists for `match.event-recorded`, previously inert because the
    // payload never actually carried them.
    const pending = await new OutboxReader(scratch.db).pending();
    const published = pending.filter(
      (event) => event.entityId === matchId && event.eventType === 'match.event-recorded',
    );
    expect(published).toHaveLength(3);
    for (const event of published) {
      expect(event.payload.matchId).toBe(matchId);
      expect(event.payload.definitionCode).toBe('strike');
      expect(event.payload.side).toBe('entrant-atlas');
      expect(event.payload.personId).toBe(personId);
      expect(typeof event.payload.occurredAt).toBe('string');
    }
  });
});
