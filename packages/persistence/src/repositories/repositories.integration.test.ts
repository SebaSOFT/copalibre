import { winConditionScript, type DisciplineDescriptor, type MatchResult } from '@copalibre/domain';
import { AuditReader } from '../audit.js';
import { InvariantViolationError, NotFoundError } from '../errors.js';
import { newId } from '../ids.js';
import { OutboxReader } from '../outbox.js';
import { createMigratedDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';
import { withTransaction } from '../transaction.js';
import { CompetitionRepository } from './competition-repository.js';
import { PersonRepository } from './person-repository.js';
import { OrganizationRepository } from './organization-repository.js';
import { EnrollmentRepository } from './enrollment-repository.js';
import { AliasRepository } from './alias-repository.js';
import { TournamentRepository } from './tournament-repository.js';

const AUDIT = { actor: 'user:organizer-1', authorizationContext: 'scope:tournament.write' };

function descriptor(): DisciplineDescriptor {
  const descriptorId = newId();
  return {
    descriptorId,
    alias: `orbital-field-${descriptorId}`,
    version: '1.0.0',
    name: 'Orbital Field',
    attribution: { author: 'CopaLibre tests', licence: 'AGPL-3.0-only' },
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 5, maxPlayers: 9 },
    segmentTypes: [{ name: 'half', label: 'Half', timed: true }],
    eventDefinitions: [
      {
        code: 'strike',
        label: 'Strike',
        category: 'positive',
        permittedSegmentTypes: ['half'],
        actorRequirement: 'person',
        payloadSchema: { type: 'object', properties: {} },
        effects: [{ kind: 'score', awardTo: 'actor', delta: 1 }],
      },
    ],
    statistics: [],
    scoringInputs: [],
    availableFormats: ['round-robin'],
    winCondition: winConditionScript('higher-score-wins', { unit: 'score' }),
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
  let participants: EnrollmentRepository;
  let competition: CompetitionRepository;
  let organizationId: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('repos');
    organizations = new OrganizationRepository(scratch.db);
    tournaments = new TournamentRepository(scratch.db);
    participants = new EnrollmentRepository(scratch.db);
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
      const { person: participant } = await new PersonRepository(scratch.db).register(uow, {
        organizationId,
        displayName: 'Jugador Uno',
        ...AUDIT,
      });
      const entrant = await participants.registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'person', personId: participant.personId },
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

describe('entrant attributes (integration)', () => {
  let scratch: ScratchDatabase;
  let organizationId = '';
  let participants: EnrollmentRepository;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('attributes');
    participants = new EnrollmentRepository(scratch.db);
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-atributos',
        name: 'Liga Atributos',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  async function seedEntrant(alias: string) {
    const tournaments = new TournamentRepository(scratch.db);
    return withTransaction(scratch.db, async (uow) => {
      const disciplineDescriptor = descriptor();
      await tournaments.saveDescriptor(uow, disciplineDescriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias,
        name: alias,
        descriptor: disciplineDescriptor,
        ...AUDIT,
      });
      const team = await participants.createTeam(uow, {
        organizationId,
        name: `Club ${alias}`,
        ...AUDIT,
      });
      const entrant = await participants.registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'team', teamId: team.teamId },
        organizationId,
        ...AUDIT,
      });
      return { tournament, entrant };
    });
  }

  it('stores a numeric and a categorical attribute and reads them back typed', async () => {
    const { entrant } = await seedEntrant('copa-atributos');

    await withTransaction(scratch.db, (uow) =>
      participants.setEntrantAttributes(uow, {
        entrantId: entrant.entrantId,
        attributes: [
          { key: 'ranking', value: 12, kind: 'numeric' },
          { key: 'region', value: 'san-juan', kind: 'categorical' },
        ],
        organizationId,
        ...AUDIT,
      }),
    );

    // Ordered by key, and each value comes back as the type it was stored under
    // — a ranking must never resurface as the string "12".
    await expect(participants.listEntrantAttributes(entrant.entrantId)).resolves.toEqual([
      { key: 'ranking', value: 12, kind: 'numeric' },
      { key: 'region', value: 'san-juan', kind: 'categorical' },
    ]);
  });

  it('replaces the whole set rather than merging, and audits before and after', async () => {
    const { entrant } = await seedEntrant('copa-correccion');

    await withTransaction(scratch.db, (uow) =>
      participants.setEntrantAttributes(uow, {
        entrantId: entrant.entrantId,
        attributes: [{ key: 'region', value: 'san-jaun', kind: 'categorical' }],
        organizationId,
        ...AUDIT,
      }),
    );
    await withTransaction(scratch.db, (uow) =>
      participants.setEntrantAttributes(uow, {
        entrantId: entrant.entrantId,
        attributes: [{ key: 'region', value: 'san-juan', kind: 'categorical' }],
        organizationId,
        ...AUDIT,
      }),
    );

    await expect(participants.listEntrantAttributes(entrant.entrantId)).resolves.toEqual([
      { key: 'region', value: 'san-juan', kind: 'categorical' },
    ]);

    const audit = await new AuditReader(scratch.db).historyFor('entrant', entrant.entrantId);
    const corrections = audit.filter((entry) => entry.action === 'entrant.attributes-set');
    expect(corrections).toHaveLength(2);
    expect(corrections[1]?.previousState).toEqual({
      attributes: [{ key: 'region', value: 'san-jaun', kind: 'categorical' }],
    });
    expect(corrections[1]?.resultingState).toEqual({
      attributes: [{ key: 'region', value: 'san-juan', kind: 'categorical' }],
    });
  });

  it('clears every attribute when given an empty set', async () => {
    const { entrant } = await seedEntrant('copa-vacia');

    await withTransaction(scratch.db, (uow) =>
      participants.setEntrantAttributes(uow, {
        entrantId: entrant.entrantId,
        attributes: [{ key: 'ranking', value: 4, kind: 'numeric' }],
        organizationId,
        ...AUDIT,
      }),
    );
    await withTransaction(scratch.db, (uow) =>
      participants.setEntrantAttributes(uow, {
        entrantId: entrant.entrantId,
        attributes: [],
        organizationId,
        ...AUDIT,
      }),
    );

    await expect(participants.listEntrantAttributes(entrant.entrantId)).resolves.toEqual([]);
  });

  it('groups a tournament’s attributes by entrant', async () => {
    const { tournament, entrant } = await seedEntrant('copa-agrupada');
    await withTransaction(scratch.db, (uow) =>
      participants.setEntrantAttributes(uow, {
        entrantId: entrant.entrantId,
        attributes: [{ key: 'ranking', value: 1, kind: 'numeric' }],
        organizationId,
        ...AUDIT,
      }),
    );

    const byEntrant = await participants.listTournamentAttributes(tournament.tournamentId);
    expect(byEntrant.get(entrant.entrantId)).toEqual([
      { key: 'ranking', value: 1, kind: 'numeric' },
    ]);
  });

  it('refuses attributes for an entrant that does not exist', async () => {
    await expect(
      withTransaction(scratch.db, (uow) =>
        participants.setEntrantAttributes(uow, {
          entrantId: newId(),
          attributes: [],
          organizationId,
          ...AUDIT,
        }),
      ),
    ).rejects.toBeInstanceOf(InvariantViolationError);
  });

  it('applies a seed order and records the mode that produced it', async () => {
    const { tournament, entrant } = await seedEntrant('copa-siembra');

    const applied = await withTransaction(scratch.db, (uow) =>
      participants.setEntrantSeeds(uow, {
        tournamentId: tournament.tournamentId,
        placements: [{ entrantId: entrant.entrantId, seed: 1 }],
        allocation: { mode: 'weighted', attributeKey: 'ranking', direction: 'lower-first' },
        organizationId,
        ...AUDIT,
      }),
    );
    expect(applied[0]?.seed).toBe(1);

    const audit = await new AuditReader(scratch.db).historyFor(
      'tournament',
      tournament.tournamentId,
    );
    const seeding = audit.find((entry) => entry.action === 'entrants.seeded');
    // The trail answers "why is this club on seed 1", not just "it is".
    expect(seeding?.resultingState).toMatchObject({
      allocation: { mode: 'weighted', attributeKey: 'ranking' },
      seeds: [{ entrantId: entrant.entrantId, seed: 1 }],
    });
    expect(seeding?.previousState).toMatchObject({
      seeds: [{ entrantId: entrant.entrantId, seed: null }],
    });
  });

  it('refuses to seed an entrant registered in another tournament', async () => {
    const { tournament } = await seedEntrant('copa-ajena');
    const other = await seedEntrant('copa-vecina');

    await expect(
      withTransaction(scratch.db, (uow) =>
        participants.setEntrantSeeds(uow, {
          tournamentId: tournament.tournamentId,
          placements: [{ entrantId: other.entrant.entrantId, seed: 1 }],
          allocation: { mode: 'manual' },
          organizationId,
          ...AUDIT,
        }),
      ),
    ).rejects.toBeInstanceOf(InvariantViolationError);
  });

  it('refuses a numeric attribute carrying a string, rolling the transaction back', async () => {
    const { entrant } = await seedEntrant('copa-invalida');

    await expect(
      withTransaction(scratch.db, (uow) =>
        participants.setEntrantAttributes(uow, {
          entrantId: entrant.entrantId,
          attributes: [{ key: 'ranking', value: 'primero', kind: 'numeric' }],
          organizationId,
          ...AUDIT,
        }),
      ),
    ).rejects.toThrow(/numeric/);

    await expect(participants.listEntrantAttributes(entrant.entrantId)).resolves.toEqual([]);
  });
});

describe('short labels (integration)', () => {
  let scratch: ScratchDatabase;
  let organizationId: string;

  const AUDIT_CONTEXT = {
    actor: 'user:registrar-1',
    authorizationContext: 'scope:participant.write',
  };

  beforeAll(async () => {
    scratch = await createMigratedDatabase('short-labels');
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-mendocina',
        name: 'Liga Mendocina',
        ...AUDIT_CONTEXT,
      }),
    );
    organizationId = organization.organizationId;
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  it('round-trips a club and a team abbreviation', async () => {
    const participants = new EnrollmentRepository(scratch.db);

    const { club, team } = await withTransaction(scratch.db, async (uow) => {
      const created = await participants.createClub(uow, {
        organizationId,
        name: 'Talleres de Mendoza',
        abbreviation: 'TLL',
        ...AUDIT_CONTEXT,
      });
      const side = await participants.createTeam(uow, {
        organizationId,
        clubId: created.clubId,
        name: "Talleres 'A'",
        abbreviation: 'TLL A',
        ...AUDIT_CONTEXT,
      });
      return { club: created, team: side };
    });

    expect((await participants.findClub(club.clubId))?.abbreviation).toBe('TLL');
    // The override survives storage, which is what makes two sides of one club
    // distinguishable on a board with room for five characters.
    expect((await participants.findTeam(team.teamId))?.abbreviation).toBe('TLL A');
  });

  it('suggests an alias from the name when none is given', async () => {
    const participants = new EnrollmentRepository(scratch.db);

    const club = await withTransaction(scratch.db, (uow) =>
      participants.createClub(uow, {
        organizationId,
        name: 'Club Atlético San Martín',
        ...AUDIT_CONTEXT,
      }),
    );

    // Derived, unlike the abbreviation: there is no judgement in lowercasing
    // and folding accents, and nobody reads a URL from the stands.
    expect(club.alias).toBe('club-atletico-san-martin');
  });

  it('disambiguates a second club of the same name instead of refusing it', async () => {
    const participants = new EnrollmentRepository(scratch.db);

    const second = await withTransaction(scratch.db, (uow) =>
      participants.createClub(uow, {
        organizationId,
        name: 'Talleres de Mendoza',
        ...AUDIT_CONTEXT,
      }),
    );

    // "Talleres de Mendoza" already exists from the round-trip test above.
    expect(second.alias).toBe('talleres-de-mendoza-2');
  });

  it('keeps the alias the organizer typed over the one it would suggest', async () => {
    const participants = new EnrollmentRepository(scratch.db);

    const club = await withTransaction(scratch.db, (uow) =>
      participants.createClub(uow, {
        organizationId,
        name: 'Casa de Italia',
        alias: 'casa-italia',
        ...AUDIT_CONTEXT,
      }),
    );

    expect(club.alias).toBe('casa-italia');
  });

  it('refuses an alias that is not one, before any row is written', async () => {
    const participants = new EnrollmentRepository(scratch.db);

    await expect(
      withTransaction(scratch.db, (uow) =>
        participants.createClub(uow, {
          organizationId,
          name: 'Club Mayúsculas',
          alias: 'Casa De Italia',
          ...AUDIT_CONTEXT,
        }),
      ),
    ).rejects.toBeInstanceOf(InvariantViolationError);
  });

  it('leaves the label absent rather than inventing one', async () => {
    const participants = new EnrollmentRepository(scratch.db);

    const club = await withTransaction(scratch.db, (uow) =>
      participants.createClub(uow, {
        organizationId,
        name: 'Club Sin Sigla',
        ...AUDIT_CONTEXT,
      }),
    );

    expect(club.abbreviation).toBeUndefined();
    expect((await participants.findClub(club.clubId))?.abbreviation).toBeUndefined();
  });

  it('refuses a malformed abbreviation before any row is written', async () => {
    const participants = new EnrollmentRepository(scratch.db);

    await expect(
      withTransaction(scratch.db, (uow) =>
        participants.createClub(uow, {
          organizationId,
          name: 'Club Sigla Rota',
          abbreviation: 'Casa d.',
          ...AUDIT_CONTEXT,
        }),
      ),
    ).rejects.toBeInstanceOf(InvariantViolationError);

    const rows = await scratch.db
      .selectFrom('clubs')
      .selectAll()
      .where('name', '=', 'Club Sigla Rota')
      .execute();
    expect(rows).toEqual([]);
  });

  it('audits a change of label, keeping what it was', async () => {
    const participants = new EnrollmentRepository(scratch.db);

    const team = await withTransaction(scratch.db, (uow) =>
      participants.createTeam(uow, {
        organizationId,
        name: "Talleres 'B'",
        abbreviation: 'TLL B',
        ...AUDIT_CONTEXT,
      }),
    );

    await withTransaction(scratch.db, (uow) =>
      participants.updateTeam(uow, {
        teamId: team.teamId,
        organizationId,
        abbreviation: 'TAL B',
        ...AUDIT_CONTEXT,
      }),
    );

    const history = await new AuditReader(scratch.db).historyFor('team', team.teamId);

    expect((await participants.findTeam(team.teamId))?.abbreviation).toBe('TAL B');
    expect(history.map((entry) => entry.action)).toEqual(['team.created', 'team.updated']);
    expect(history[1]?.previousState).toMatchObject({ abbreviation: 'TLL B' });
  });

  it('clears a label when the organizer asks, without deleting the team', async () => {
    const participants = new EnrollmentRepository(scratch.db);

    const team = await withTransaction(scratch.db, (uow) =>
      participants.createTeam(uow, {
        organizationId,
        name: 'Equipo Temporal',
        abbreviation: 'TMP',
        ...AUDIT_CONTEXT,
      }),
    );

    const cleared = await withTransaction(scratch.db, (uow) =>
      participants.updateTeam(uow, {
        teamId: team.teamId,
        organizationId,
        abbreviation: null,
        ...AUDIT_CONTEXT,
      }),
    );

    expect(cleared.abbreviation).toBeUndefined();
  });
});

describe('alias redirects (integration)', () => {
  let scratch: ScratchDatabase;
  let organizationId: string;
  let otherOrganizationId: string;

  const AUDIT = { actor: 'user:admin', authorizationContext: 'scope:organization.write' };

  beforeAll(async () => {
    scratch = await createMigratedDatabase('alias-redirects');
    const organizations = new OrganizationRepository(scratch.db);
    const [first, second] = await Promise.all([
      withTransaction(scratch.db, (uow) =>
        organizations.create(uow, { alias: 'liga-uno', name: 'Liga Uno', ...AUDIT }),
      ),
      withTransaction(scratch.db, (uow) =>
        organizations.create(uow, { alias: 'liga-dos', name: 'Liga Dos', ...AUDIT }),
      ),
    ]);
    organizationId = first.organizationId;
    otherOrganizationId = second.organizationId;

    for (const [orgId, alias] of [
      [organizationId, 'clausura-2026'],
      [otherOrganizationId, 'otra-cosa'],
    ] as const) {
      await scratch.db
        .insertInto('tournaments')
        .values({
          tournament_id: newId(),
          organization_id: orgId,
          alias,
          name: alias,
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
    }
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  it('redirects a renamed alias to the canonical one', async () => {
    const aliases = new AliasRepository(scratch.db);
    await withTransaction(scratch.db, (uow) =>
      aliases.recordRename(uow, {
        organizationId,
        scope: 'tournament',
        oldAlias: 'apertura-2026',
        newAlias: 'clausura-2026',
        ...AUDIT,
      }),
    );

    expect(await aliases.resolveTournamentAlias(organizationId, 'apertura-2026')).toEqual({
      kind: 'redirect',
      to: 'clausura-2026',
      status: 301,
    });
    expect(await aliases.resolveTournamentAlias(organizationId, 'clausura-2026')).toEqual({
      kind: 'current',
    });
  });

  it('never resolves one organization’s old alias inside another', async () => {
    const aliases = new AliasRepository(scratch.db);

    // Crossing them would hand a spectator somebody else's competition.
    expect(await aliases.resolveTournamentAlias(otherOrganizationId, 'apertura-2026')).toEqual({
      kind: 'unknown',
    });
  });

  it('reports an alias nobody ever had as unknown, not as a near match', async () => {
    const aliases = new AliasRepository(scratch.db);

    expect(await aliases.resolveTournamentAlias(organizationId, 'clausura-2027')).toEqual({
      kind: 'unknown',
    });
  });
});
