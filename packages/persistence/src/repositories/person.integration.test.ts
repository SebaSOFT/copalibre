import { InvariantViolationError } from '../errors.js';
import { withTransaction } from '../transaction.js';
import { OrganizationRepository } from './organization-repository.js';
import { EnrollmentRepository } from './enrollment-repository.js';
import { TournamentRepository } from './tournament-repository.js';
import { CompetitionRepository } from './competition-repository.js';
import { StatisticRepository } from './statistic-repository.js';
import { squadOfDiscipline, footballDescriptor } from '@copalibre/domain';
import { PersonRepository } from './person-repository.js';
import { ObjectMetadataRepository } from './object-metadata-repository.js';
import { createMigratedDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';

/**
 * The split, against real storage: one human across two teams under one key,
 * recognised rather than duplicated however the document was typed.
 */

const AUDIT = { actor: 'user:registrar-1', authorizationContext: 'scope:participant.write' };

/** Two disciplines one club fields sides in. */
const FOOTBALL = '11111111-1111-4111-8111-111111111111';
const FUTSAL = '22222222-2222-4222-8222-222222222222';

describe('people and their memberships (integration)', () => {
  let scratch: ScratchDatabase;
  let organizationId: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('persons');
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'club-murialdo',
        name: 'Club Leonardo Murialdo',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  async function team(name: string, disciplineId?: string) {
    return withTransaction(scratch.db, (uow) =>
      new EnrollmentRepository(scratch.db).createTeam(uow, {
        organizationId,
        name,
        ...(disciplineId === undefined ? {} : { disciplineId }),
        ...AUDIT,
      }),
    );
  }

  it('recognises one human however their document was typed', async () => {
    const people = new PersonRepository(scratch.db);

    const first = await withTransaction(scratch.db, (uow) =>
      people.register(uow, {
        organizationId,
        displayName: 'Adolfo Iván Isoler',
        naturalKey: { kind: 'dni', value: '12.345.678' },
        ...AUDIT,
      }),
    );
    const again = await withTransaction(scratch.db, (uow) =>
      people.register(uow, {
        organizationId,
        displayName: 'ISOLER, Adolfo I.',
        naturalKey: { kind: 'dni', value: '12345678' },
        ...AUDIT,
      }),
    );

    expect(first.recognised).toBe(false);
    // Two spellings, two forms of the name, one person — which is what stops an
    // import creating a second.
    expect(again.recognised).toBe(true);
    expect(again.person.personId).toBe(first.person.personId);
  });

  it('lets one person play for two teams', async () => {
    const people = new PersonRepository(scratch.db);
    const [football, futsal] = await Promise.all([
      team('Murialdo Fútbol'),
      team('Murialdo Futsal'),
    ]);

    const { person } = await withTransaction(scratch.db, (uow) =>
      people.register(uow, {
        organizationId,
        displayName: 'Elías Salomón',
        naturalKey: { kind: 'dni', value: '23.456.789' },
        ...AUDIT,
      }),
    );

    await withTransaction(scratch.db, async (uow) => {
      await people.enlist(uow, {
        personId: person.personId,
        teamId: football.teamId,
        role: 'player',
        organizationId,
        ...AUDIT,
      });
      await people.enlist(uow, {
        personId: person.personId,
        teamId: futsal.teamId,
        role: 'player',
        organizationId,
        ...AUDIT,
      });
    });

    const memberships = await people.playersOf(person.personId);
    expect(memberships).toHaveLength(2);
    expect(new Set(memberships.map((m) => m.teamId))).toEqual(
      new Set([football.teamId, futsal.teamId]),
    );
  });

  it('refuses the same person twice in one team', async () => {
    const people = new PersonRepository(scratch.db);
    const squad = await team('Murialdo Reserva');
    const { person } = await withTransaction(scratch.db, (uow) =>
      people.register(uow, { organizationId, displayName: 'Pablo Ribas', ...AUDIT }),
    );

    await withTransaction(scratch.db, (uow) =>
      people.enlist(uow, {
        personId: person.personId,
        teamId: squad.teamId,
        role: 'player',
        organizationId,
        ...AUDIT,
      }),
    );

    await expect(
      withTransaction(scratch.db, (uow) =>
        people.enlist(uow, {
          personId: person.personId,
          teamId: squad.teamId,
          role: 'substitute',
          organizationId,
          ...AUDIT,
        }),
      ),
    ).rejects.toThrow();
  });

  it('registers somebody with no document, and attaches one later without duplicating them', async () => {
    const people = new PersonRepository(scratch.db);

    const { person } = await withTransaction(scratch.db, (uow) =>
      people.register(uow, { organizationId, displayName: 'Tomás Scibilia', ...AUDIT }),
    );
    expect(person.naturalKey).toBeUndefined();

    const withKey = await withTransaction(scratch.db, (uow) =>
      people.attachNaturalKey(uow, {
        personId: person.personId,
        organizationId,
        naturalKey: { kind: 'dni', value: '34.567.890' },
        ...AUDIT,
      }),
    );

    expect(withKey.personId).toBe(person.personId);
    expect(
      await people.findByNaturalKey(organizationId, { kind: 'dni', value: '34567890' }),
    ).toMatchObject({ personId: person.personId });
  });

  it('refuses to attach a document another person already carries', async () => {
    const people = new PersonRepository(scratch.db);
    await withTransaction(scratch.db, (uow) =>
      people.register(uow, {
        organizationId,
        displayName: 'Franco Nardi',
        naturalKey: { kind: 'dni', value: '45.678.901' },
        ...AUDIT,
      }),
    );
    const { person: other } = await withTransaction(scratch.db, (uow) =>
      people.register(uow, { organizationId, displayName: 'Lucas Sottano', ...AUDIT }),
    );

    // Two records claiming one human: only an operator can say which is right.
    await expect(
      withTransaction(scratch.db, (uow) =>
        people.attachNaturalKey(uow, {
          personId: other.personId,
          organizationId,
          naturalKey: { kind: 'dni', value: '45678901' },
          ...AUDIT,
        }),
      ),
    ).rejects.toBeInstanceOf(InvariantViolationError);
  });

  it('tells a club’s two sides apart by the discipline each plays', async () => {
    const people = new PersonRepository(scratch.db);
    const football = await team('Murialdo Fútbol A', FOOTBALL);
    const futsal = await team('Murialdo Futsal A', FUTSAL);

    const { person } = await withTransaction(scratch.db, (uow) =>
      people.register(uow, {
        organizationId,
        displayName: 'Facundo Lana',
        naturalKey: { kind: 'dni', value: '67.890.123' },
        ...AUDIT,
      }),
    );
    await withTransaction(scratch.db, async (uow) => {
      for (const side of [football, futsal]) {
        await people.enlist(uow, {
          personId: person.personId,
          teamId: side.teamId,
          role: 'player',
          organizationId,
          ...AUDIT,
        });
      }
    });

    const teams = [football, futsal];
    const memberships = await people.playersOf(person.personId);

    // A match-roster constraint is a claim about one side. Before a team named its
    // discipline, checking it against the wrong squad was not even expressible
    // as a mistake.
    expect(squadOfDiscipline(memberships, teams, FOOTBALL).map((p) => p.teamId)).toEqual([
      football.teamId,
    ]);
    expect(squadOfDiscipline(memberships, teams, FUTSAL).map((p) => p.teamId)).toEqual([
      futsal.teamId,
    ]);
  });

  it('removes a membership, auditably, and lets the same person rejoin the same team', async () => {
    const people = new PersonRepository(scratch.db);
    const squad = await team('Murialdo Cuarta');
    const { person } = await withTransaction(scratch.db, (uow) =>
      people.register(uow, { organizationId, displayName: 'Renzo Bulacio', ...AUDIT }),
    );

    const player = await withTransaction(scratch.db, (uow) =>
      people.enlist(uow, {
        personId: person.personId,
        teamId: squad.teamId,
        role: 'player',
        organizationId,
        ...AUDIT,
      }),
    );

    await withTransaction(scratch.db, (uow) =>
      people.dismiss(uow, { playerId: player.playerId, organizationId, ...AUDIT }),
    );

    expect(await people.squadOf(squad.teamId)).toEqual([]);
    expect(await people.playersOf(person.personId)).toEqual([]);

    const rows = await scratch.db
      .selectFrom('audit_log')
      .selectAll()
      .where('entity_type', '=', 'player')
      .where('entity_id', '=', player.playerId)
      .where('action', '=', 'player.dismissed')
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.previous_state).toMatchObject({
      playerId: player.playerId,
      personId: person.personId,
      teamId: squad.teamId,
      role: 'player',
    });

    // Hard delete, not a soft-delete flag: rejoining the same team must not
    // collide with `players_person_team_unique`.
    const rejoined = await withTransaction(scratch.db, (uow) =>
      people.enlist(uow, {
        personId: person.personId,
        teamId: squad.teamId,
        role: 'substitute',
        organizationId,
        ...AUDIT,
      }),
    );
    expect(rejoined.role).toBe('substitute');
  });

  it('is a no-op dismissing a membership that does not exist', async () => {
    const people = new PersonRepository(scratch.db);
    await expect(
      withTransaction(scratch.db, (uow) =>
        people.dismiss(uow, {
          playerId: '00000000-0000-4000-8000-000000000000',
          organizationId,
          ...AUDIT,
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it('resolves a bulk set of person ids in one call', async () => {
    const people = new PersonRepository(scratch.db);
    const [first, second] = await Promise.all([
      withTransaction(scratch.db, (uow) =>
        people.register(uow, { organizationId, displayName: 'Ariana Molina', ...AUDIT }),
      ),
      withTransaction(scratch.db, (uow) =>
        people.register(uow, { organizationId, displayName: 'Bruno Salas', ...AUDIT }),
      ),
    ]);

    const found = await people.findPersons([first.person.personId, second.person.personId]);
    expect(new Set(found.map((p) => p.personId))).toEqual(
      new Set([first.person.personId, second.person.personId]),
    );

    expect(await people.findPersons([])).toEqual([]);
  });

  it('sets and clears a nationality, refusing an invalid country code', async () => {
    const people = new PersonRepository(scratch.db);
    const { person } = await withTransaction(scratch.db, (uow) =>
      people.register(uow, { organizationId, displayName: 'Nadia Farías', ...AUDIT }),
    );
    expect(person.nationality).toBeUndefined();

    const withNationality = await withTransaction(scratch.db, (uow) =>
      people.setNationality(uow, {
        personId: person.personId,
        organizationId,
        nationality: 'AR',
        ...AUDIT,
      }),
    );
    expect(withNationality.nationality).toBe('AR');
    expect((await people.findPerson(person.personId))?.nationality).toBe('AR');

    const cleared = await withTransaction(scratch.db, (uow) =>
      people.setNationality(uow, {
        personId: person.personId,
        organizationId,
        nationality: null,
        ...AUDIT,
      }),
    );
    expect(cleared.nationality).toBeUndefined();

    await expect(
      withTransaction(scratch.db, (uow) =>
        people.setNationality(uow, {
          personId: person.personId,
          organizationId,
          nationality: 'ZZ',
          ...AUDIT,
        }),
      ),
    ).rejects.toBeInstanceOf(InvariantViolationError);
  });

  it('attaches an uploaded photo reference', async () => {
    const people = new PersonRepository(scratch.db);
    const { person } = await withTransaction(scratch.db, (uow) =>
      people.register(uow, { organizationId, displayName: 'Diego Yapura', ...AUDIT }),
    );
    expect(person.photoObjectId).toBeUndefined();

    const objectMetadata = await withTransaction(scratch.db, (uow) =>
      new ObjectMetadataRepository(scratch.db).save(uow, {
        organizationId,
        profile: 'filesystem',
        storageKey: `${organizationId}/photo.jpg`,
        contentType: 'image/jpeg',
        sizeBytes: 1024,
        uploadedBy: AUDIT.actor,
      }),
    );

    const withPhoto = await withTransaction(scratch.db, (uow) =>
      people.setPhoto(uow, {
        personId: person.personId,
        organizationId,
        photoObjectId: objectMetadata.objectId,
        ...AUDIT,
      }),
    );
    expect(withPhoto.photoObjectId).toBe(objectMetadata.objectId);
    expect((await people.findPerson(person.personId))?.photoObjectId).toBe(objectMetadata.objectId);
  });

  it('keeps the document out of the audit trail', async () => {
    const people = new PersonRepository(scratch.db);
    await withTransaction(scratch.db, (uow) =>
      people.register(uow, {
        organizationId,
        displayName: 'Gino Celsi',
        naturalKey: { kind: 'dni', value: '56.789.012' },
        ...AUDIT,
      }),
    );

    const rows = await scratch.db
      .selectFrom('audit_log')
      .select('resulting_state')
      .where('entity_type', '=', 'person')
      .execute();

    // An audit trail is read by more people than a registration form.
    expect(JSON.stringify(rows)).not.toContain('56789012');
    expect(JSON.stringify(rows)).not.toContain('56.789.012');
  });

  it('stores, updates, and clears a birth date with validation', async () => {
    const people = new PersonRepository(scratch.db);
    const { person } = await withTransaction(scratch.db, (uow) =>
      people.register(uow, {
        organizationId,
        displayName: 'Camila Navarro',
        birthDate: '1998-04-12',
        ...AUDIT,
      }),
    );
    expect(person.birthDate).toBe('1998-04-12');
    expect((await people.findPerson(person.personId))?.birthDate).toBe('1998-04-12');

    const updated = await withTransaction(scratch.db, (uow) =>
      people.setBirthDate(uow, {
        personId: person.personId,
        organizationId,
        birthDate: '1999-01-01',
        ...AUDIT,
      }),
    );
    expect(updated.birthDate).toBe('1999-01-01');

    const cleared = await withTransaction(scratch.db, (uow) =>
      people.setBirthDate(uow, {
        personId: person.personId,
        organizationId,
        birthDate: null,
        ...AUDIT,
      }),
    );
    expect(cleared.birthDate).toBeUndefined();

    await expect(
      withTransaction(scratch.db, (uow) =>
        people.setBirthDate(uow, {
          personId: person.personId,
          organizationId,
          birthDate: '2099-01-01',
          ...AUDIT,
        }),
      ),
    ).rejects.toBeInstanceOf(InvariantViolationError);
  });

  it('reads a chronological competition history across tournaments and teams', async () => {
    const people = new PersonRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const tournaments = new TournamentRepository(scratch.db);
    const descriptor = footballDescriptor();

    const { person } = await withTransaction(scratch.db, (uow) =>
      people.register(uow, { organizationId, displayName: 'Franco Rossi', ...AUDIT }),
    );

    const [teamA, teamB] = await Promise.all([team('Franco FC A'), team('Franco FC B')]);

    await withTransaction(scratch.db, async (uow) => {
      await people.enlist(uow, {
        personId: person.personId,
        teamId: teamA.teamId,
        role: 'player',
        organizationId,
        ...AUDIT,
      });
      await people.enlist(uow, {
        personId: person.personId,
        teamId: teamB.teamId,
        role: 'player',
        organizationId,
        ...AUDIT,
      });
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...AUDIT });
    });

    const tourney1 = await withTransaction(scratch.db, (uow) =>
      tournaments.create(uow, {
        organizationId,
        alias: 'copa-franco-1',
        name: 'Copa Franco 1',
        descriptor,
        ...AUDIT,
      }),
    );
    await withTransaction(scratch.db, (uow) =>
      tournaments.publish(uow, {
        tournamentId: tourney1.tournamentId,
        organizationId,
        ...AUDIT,
      }),
    );
    await withTransaction(scratch.db, (uow) =>
      enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: tourney1.tournamentId,
        entrantRef: { kind: 'team', teamId: teamA.teamId },
        ...AUDIT,
      }),
    );

    const tourney2 = await withTransaction(scratch.db, (uow) =>
      tournaments.create(uow, {
        organizationId,
        alias: 'copa-franco-2',
        name: 'Copa Franco 2',
        descriptor,
        ...AUDIT,
      }),
    );
    await withTransaction(scratch.db, (uow) =>
      tournaments.publish(uow, {
        tournamentId: tourney2.tournamentId,
        organizationId,
        ...AUDIT,
      }),
    );
    await withTransaction(scratch.db, (uow) =>
      enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: tourney2.tournamentId,
        entrantRef: { kind: 'team', teamId: teamB.teamId },
        ...AUDIT,
      }),
    );

    const history = await people.competitionHistory(organizationId, person.personId);
    expect(history).toHaveLength(2);
    expect(history[0]?.tournamentAlias).toBe('copa-franco-1');
    expect(history[0]?.teamName).toBe('Franco FC A');
    expect(history[1]?.tournamentAlias).toBe('copa-franco-2');
    expect(history[1]?.teamName).toBe('Franco FC B');
  });

  it('reads career statistic totals grouped by discipline', async () => {
    const people = new PersonRepository(scratch.db);
    const statistics = new StatisticRepository(scratch.db);
    const tournaments = new TournamentRepository(scratch.db);
    const enrollment = new EnrollmentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const descriptor = footballDescriptor();

    const { person } = await withTransaction(scratch.db, (uow) =>
      people.register(uow, { organizationId, displayName: 'Matías Goleador', ...AUDIT }),
    );

    // Empty totals for player with no records
    expect(await people.careerTotals(organizationId, person.personId)).toEqual([]);

    const t1 = await team('Matías FC 1');
    const t2 = await team('Matías FC 2');

    const tournament = await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...AUDIT });
      return tournaments.create(uow, {
        organizationId,
        alias: 'copa-matias',
        name: 'Copa Matías',
        descriptor,
        ...AUDIT,
      });
    });

    const [entrant1, entrant2] = await withTransaction(scratch.db, async (uow) => {
      const e1 = await enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'team', teamId: t1.teamId },
        ...AUDIT,
      });
      const e2 = await enrollment.registerEntrant(uow, {
        organizationId,
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'team', teamId: t2.teamId },
        ...AUDIT,
      });
      return [e1, e2];
    });

    const [match1, match2] = await withTransaction(scratch.db, async (uow) => {
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Regular Phase',
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      });
      const [f1, f2] = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [
          { round: 1, homeEntrantId: entrant1.entrantId, awayEntrantId: entrant2.entrantId },
          { round: 2, homeEntrantId: entrant2.entrantId, awayEntrantId: entrant1.entrantId },
        ],
        organizationId,
        ...AUDIT,
      });
      if (!f1 || !f2) {
        throw new Error('Fixtures not created in test');
      }
      const m1 = await competition.createMatch(uow, {
        fixtureId: f1.fixtureId,
        number: 1,
        organizationId,
        ...AUDIT,
      });
      const m2 = await competition.createMatch(uow, {
        fixtureId: f2.fixtureId,
        number: 2,
        organizationId,
        ...AUDIT,
      });
      return [m1, m2];
    });

    await withTransaction(scratch.db, async (uow) => {
      await statistics.projectMatch(uow, {
        organizationId,
        matchId: match1.matchId,
        projectionVersion: 1,
        figures: [
          {
            collectorCode: 'goals-for',
            actorGranularity: 'person',
            actorId: person.personId,
            competitionGranularity: 'match',
            competitionId: match1.matchId,
            value: 3,
            samples: 1,
          },
          {
            collectorCode: 'custom-unclaimed',
            actorGranularity: 'person',
            actorId: person.personId,
            competitionGranularity: 'organization',
            competitionId: organizationId,
            value: 3,
            samples: 1,
          },
        ],
      });
      await statistics.projectMatch(uow, {
        organizationId,
        matchId: match2.matchId,
        projectionVersion: 1,
        figures: [
          {
            collectorCode: 'goals-for',
            actorGranularity: 'person',
            actorId: person.personId,
            competitionGranularity: 'match',
            competitionId: match2.matchId,
            value: 2,
            samples: 1,
          },
          {
            collectorCode: 'custom-unclaimed',
            actorGranularity: 'person',
            actorId: person.personId,
            competitionGranularity: 'organization',
            competitionId: organizationId,
            value: 2,
            samples: 1,
          },
        ],
      });
    });

    const totals = await people.careerTotals(organizationId, person.personId);
    expect(totals).toHaveLength(2);

    const footballTotals = totals.find((t) => t.descriptorId === descriptor.descriptorId);
    expect(footballTotals).toBeDefined();
    expect(footballTotals?.totals).toEqual([{ collectorCode: 'goals-for', value: 5, samples: 2 }]);

    const unclaimedTotals = totals.find((t) => t.descriptorId === 'default');
    expect(unclaimedTotals).toBeDefined();
    expect(unclaimedTotals?.totals).toEqual([
      { collectorCode: 'custom-unclaimed', value: 5, samples: 2 },
    ]);
  });
});
