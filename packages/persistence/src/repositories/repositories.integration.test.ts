import type { DisciplineDescriptor, MatchResult } from '@copalibre/domain';
import { AuditReader } from '../audit.js';
import { InvariantViolationError, NotFoundError } from '../errors.js';
import { newId } from '../ids.js';
import { OutboxReader } from '../outbox.js';
import { createMigratedDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';
import { withTransaction } from '../transaction.js';
import { CompetitionRepository } from './competition-repository.js';
import { OrganizationRepository } from './organization-repository.js';
import { ParticipantRepository } from './participant-repository.js';
import { TournamentRepository } from './tournament-repository.js';

const AUDIT = { actor: 'user:organizer-1', authorizationContext: 'scope:tournament.write' };

function descriptor(): DisciplineDescriptor {
  return {
    descriptorId: newId(),
    version: 1,
    name: 'Orbital Field',
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 5, maxPlayers: 9 },
    segmentTypes: [{ name: 'half', label: 'Half', timed: true }],
    eventDefinitions: [
      {
        code: 'strike',
        label: 'Strike',
        category: 'positive',
        permittedSegmentTypes: ['half'],
        actorRequirement: 'participant',
        payloadSchema: { type: 'object', properties: {} },
        effects: [{ kind: 'score', side: 'actor', delta: 1 }],
      },
    ],
    statistics: [],
    scoringInputs: [],
    availableFormats: ['round-robin'],
    notificationRuleCapabilities: [],
    defaults: { scoring: { pointsPerWin: 3 }, tiebreakers: ['points'] },
    fieldPolicies: {
      'scoring.pointsPerWin': {
        permission: { kind: 'replaced' },
        mutationClass: 'blocked_after_results',
      },
      tiebreakers: {
        permission: { kind: 'merged', strategy: 'union-list' },
        mutationClass: 'requires_rebuild',
      },
      'identityRules.federationCode': {
        permission: { kind: 'forbidden' },
        mutationClass: 'safe',
      },
    },
  };
}

describe('repositories (integration)', () => {
  let scratch: ScratchDatabase;
  let organizations: OrganizationRepository;
  let tournaments: TournamentRepository;
  let participants: ParticipantRepository;
  let competition: CompetitionRepository;
  let organizationId: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('repos');
    organizations = new OrganizationRepository(scratch.db);
    tournaments = new TournamentRepository(scratch.db);
    participants = new ParticipantRepository(scratch.db);
    competition = new CompetitionRepository(scratch.db);

    const organization = await withTransaction(scratch.db, (uow) =>
      organizations.create(uow, {
        alias: 'liga-orbital',
        name: 'Liga Orbital',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;
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
    expect(effective.compiledFrom.descriptorVersion).toBe(1);
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
      const stage = await competition.createStage(uow, {
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
      sides: [{ entrantId, score: 3 }],
      winnerEntrantId: entrantId,
      recordedAt: '2026-07-29T14:00:00.000Z',
    };

    const finalized = await withTransaction(scratch.db, (uow) =>
      competition.recordResult(uow, { matchId, result, organizationId, ...AUDIT }),
    );
    expect(finalized.status).toBe('finalized');
    expect(finalized.result?.sides).toEqual([{ entrantId, score: 3 }]);

    // Second attempt: the no-overwrite product contract.
    await expect(
      withTransaction(scratch.db, (uow) =>
        competition.recordResult(uow, {
          matchId,
          result: { ...result, sides: [{ entrantId, score: 99 }] },
          organizationId,
          ...AUDIT,
        }),
      ),
    ).rejects.toThrow(/audited correction workflow/);

    // The stored result is unchanged.
    await expect(competition.findMatch(matchId)).resolves.toMatchObject({
      result: { sides: [{ entrantId, score: 3 }] },
    });

    const audit = await new AuditReader(scratch.db).historyFor('match', matchId);
    expect(audit.map((entry) => entry.action)).toEqual(['match.created', 'match.finalized']);
    expect(audit[1]?.previousState).toMatchObject({ result: null });
  });

  it('appends match events in sequence and exposes them in order', async () => {
    const disciplineDescriptor = descriptor();
    const { matchId, segmentId, participantId } = await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, disciplineDescriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-eventos',
        name: 'Copa Eventos',
        descriptor: disciplineDescriptor,
        ...AUDIT,
      });
      const stage = await competition.createStage(uow, {
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
      const player = await participants.createParticipant(uow, {
        organizationId,
        displayName: 'Atacante Uno',
        type: 'individual',
        ...AUDIT,
      });
      return {
        matchId: match.matchId,
        segmentId: segment.segmentId,
        participantId: player.participantId,
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
            side: 'home',
            participantId,
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
  });

  it('audits entrant status transitions with previous and resulting state', async () => {
    const disciplineDescriptor = descriptor();
    const entrantId = await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, disciplineDescriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-registro',
        name: 'Copa Registro',
        descriptor: disciplineDescriptor,
        ...AUDIT,
      });
      const participant = await participants.createParticipant(uow, {
        organizationId,
        displayName: 'Jugador Uno',
        type: 'individual',
        ...AUDIT,
      });
      const entrant = await participants.registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'participant', participantId: participant.participantId },
        organizationId,
        ...AUDIT,
      });
      return entrant.entrantId;
    });

    await withTransaction(scratch.db, (uow) =>
      participants.setEntrantStatus(uow, {
        entrantId,
        status: 'accepted',
        reason: 'eligibility verified',
        organizationId,
        ...AUDIT,
      }),
    );

    const audit = await new AuditReader(scratch.db).historyFor('entrant', entrantId);
    expect(audit.map((entry) => entry.action)).toEqual(['entrant.registered', 'entrant.accepted']);
    expect(audit[1]).toMatchObject({
      previousState: { status: 'pending' },
      resultingState: { status: 'accepted' },
      reason: 'eligibility verified',
    });
  });

  it('raises NotFoundError when finalizing a match that does not exist', async () => {
    await expect(
      withTransaction(scratch.db, (uow) =>
        competition.recordResult(uow, {
          matchId: newId(),
          result: { sides: [], recordedAt: '2026-07-29T14:00:00.000Z' },
          organizationId,
          ...AUDIT,
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses an empty fixture set', async () => {
    await expect(
      withTransaction(scratch.db, (uow) =>
        competition.createFixtures(uow, {
          stageId: newId(),
          fixtures: [],
          organizationId,
          ...AUDIT,
        }),
      ),
    ).rejects.toBeInstanceOf(InvariantViolationError);
  });
});
