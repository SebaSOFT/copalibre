import { AuditReader } from '../audit.js';
import { InvariantViolationError } from '../errors.js';
import { newId } from '../ids.js';
import { createMigratedDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';
import { withTransaction } from '../transaction.js';
import { PersonRepository } from './person-repository.js';
import { OrganizationRepository } from './organization-repository.js';
import { EnrollmentRepository } from './enrollment-repository.js';
import { ObjectMetadataRepository } from './object-metadata-repository.js';
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
  let organizationId: string;

  beforeAll(async () => {
    const fixture = await startRepositoriesFixture();
    scratch = fixture.scratch;
    tournaments = fixture.tournaments;
    participants = fixture.participants;
    organizationId = fixture.organizationId;
  });

  afterAll(async () => {
    await scratch?.drop();
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

  it('resolves entrant abbreviations once, rejects duplicate officer changes, and lists unresolved entrants', async () => {
    const disciplineDescriptor = descriptor();
    const ids = await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, disciplineDescriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-abreviaturas',
        name: 'Copa Abreviaturas',
        descriptor: disciplineDescriptor,
        ...AUDIT,
      });
      const otherTournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-abreviaturas-otra',
        name: 'Copa Abreviaturas Otra',
        descriptor: disciplineDescriptor,
        ...AUDIT,
      });
      const people = await Promise.all(
        ['Casa de Italia', 'Elección Explícita', 'Entrada Malformada', 'Club Órbita'].map(
          async (displayName) =>
            new PersonRepository(scratch.db).register(uow, {
              organizationId,
              displayName,
              ...AUDIT,
            }),
        ),
      );
      const [casaDeItalia, explicitChoice, malformedEntry, clubOrbita] = people;
      if (!casaDeItalia || !explicitChoice || !malformedEntry || !clubOrbita) {
        throw new Error('Expected four participants');
      }
      const first = await participants.registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'person', personId: casaDeItalia.person.personId },
        organizationId,
        ...AUDIT,
      });
      const colliding = await participants.registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'person', personId: casaDeItalia.person.personId },
        organizationId,
        ...AUDIT,
      });
      const explicit = await participants.registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'person', personId: explicitChoice.person.personId },
        abbreviation: 'CUSTOM',
        organizationId,
        ...AUDIT,
      });
      const malformed = await participants.registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'person', personId: malformedEntry.person.personId },
        abbreviation: 'not valid',
        organizationId,
        ...AUDIT,
      });
      const collidingInput = await participants.registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'person', personId: clubOrbita.person.personId },
        abbreviation: 'CI',
        organizationId,
        ...AUDIT,
      });
      const other = await participants.registerEntrant(uow, {
        tournamentId: otherTournament.tournamentId,
        entrantRef: { kind: 'person', personId: clubOrbita.person.personId },
        organizationId,
        ...AUDIT,
      });
      return {
        tournamentId: tournament.tournamentId,
        first: first.entrantId,
        colliding: colliding.entrantId,
        explicit: explicit.entrantId,
        malformed: malformed.entrantId,
        collidingInput: collidingInput.entrantId,
        other: other.entrantId,
      };
    });

    expect((await participants.findEntrant(ids.first))?.abbreviation).toBe('CI');
    expect((await participants.findEntrant(ids.colliding))?.abbreviation).toBeUndefined();
    expect((await participants.findEntrant(ids.explicit))?.abbreviation).toBe('CUSTOM');
    expect((await participants.findEntrant(ids.malformed))?.abbreviation).toBe('EM');
    expect((await participants.findEntrant(ids.collidingInput))?.abbreviation).toBe('CO');
    expect((await participants.findEntrant(ids.other))?.abbreviation).toBe('CO');
    expect(
      (await participants.listEntrantsNeedingAbbreviation(ids.tournamentId)).map(
        (entrant) => entrant.entrantId,
      ),
    ).toEqual([ids.colliding]);
    await expect(
      withTransaction(scratch.db, (uow) =>
        participants.setEntrantAbbreviation(uow, {
          entrantId: ids.colliding,
          abbreviation: 'CI',
          organizationId,
          ...AUDIT,
        }),
      ),
    ).rejects.toThrow('already used by another entrant');
    await withTransaction(scratch.db, (uow) =>
      participants.setEntrantAbbreviation(uow, {
        entrantId: ids.colliding,
        abbreviation: 'C I 2',
        organizationId,
        ...AUDIT,
      }),
    );

    expect(
      (await participants.listEntrantsNeedingAbbreviation(ids.tournamentId)).map(
        (entrant) => entrant.entrantId,
      ),
    ).toEqual([]);
    const audit = await new AuditReader(scratch.db).historyFor('entrant', ids.colliding);
    expect(audit.at(-1)).toMatchObject({
      action: 'entrant.abbreviation-set',
      previousState: { abbreviation: null },
      resultingState: { abbreviation: 'C I 2' },
    });
  });

  it('lists only aliases of teams registered as entrants in the given tournament', async () => {
    const disciplineDescriptor = descriptor();
    const { tournamentId, otherTournamentId, registeredAlias, unregisteredAlias } =
      await withTransaction(scratch.db, async (uow) => {
        await tournaments.saveDescriptor(uow, disciplineDescriptor, { organizationId, ...AUDIT });
        const tournament = await tournaments.create(uow, {
          organizationId,
          alias: 'copa-alias-registrados',
          name: 'Copa Alias Registrados',
          descriptor: disciplineDescriptor,
          ...AUDIT,
        });
        const otherTournament = await tournaments.create(uow, {
          organizationId,
          alias: 'copa-alias-otra',
          name: 'Copa Alias Otra',
          descriptor: disciplineDescriptor,
          ...AUDIT,
        });
        const registeredTeam = await participants.createTeam(uow, {
          organizationId,
          name: 'Club Registrado',
          ...AUDIT,
        });
        await participants.registerEntrant(uow, {
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: registeredTeam.teamId },
          organizationId,
          ...AUDIT,
        });
        // A team that exists in the organization but was never registered as an
        // entrant in this tournament — must not appear.
        const unregisteredTeam = await participants.createTeam(uow, {
          organizationId,
          name: 'Club Sin Registrar',
          ...AUDIT,
        });
        // A person-kind entrant in the same tournament — must not contribute an alias.
        const { person } = await new PersonRepository(scratch.db).register(uow, {
          organizationId,
          displayName: 'Jugador Individual',
          ...AUDIT,
        });
        await participants.registerEntrant(uow, {
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'person', personId: person.personId },
          organizationId,
          ...AUDIT,
        });
        // A team registered in a *different* tournament — must not appear either.
        const otherTeam = await participants.createTeam(uow, {
          organizationId,
          name: 'Club De Otro Torneo',
          ...AUDIT,
        });
        await participants.registerEntrant(uow, {
          tournamentId: otherTournament.tournamentId,
          entrantRef: { kind: 'team', teamId: otherTeam.teamId },
          organizationId,
          ...AUDIT,
        });
        return {
          tournamentId: tournament.tournamentId,
          otherTournamentId: otherTournament.tournamentId,
          registeredAlias: registeredTeam.alias,
          unregisteredAlias: unregisteredTeam.alias,
        };
      });

    const aliases = await participants.listRegisteredTeamAliases(tournamentId);

    expect(aliases).toEqual([registeredAlias]);
    expect(aliases).not.toContain(unregisteredAlias);

    const otherAliases = await participants.listRegisteredTeamAliases(otherTournamentId);
    expect(otherAliases).not.toContain(registeredAlias);
  });

  it("affiliates a person with a club and lists only that club's members", async () => {
    const people = new PersonRepository(scratch.db);
    const club = await withTransaction(scratch.db, (uow) =>
      participants.createClub(uow, { organizationId, name: 'Club Portal FC', ...AUDIT }),
    );
    const otherClub = await withTransaction(scratch.db, (uow) =>
      participants.createClub(uow, { organizationId, name: 'Other Club FC', ...AUDIT }),
    );

    const { person: own } = await withTransaction(scratch.db, (uow) =>
      people.register(uow, {
        organizationId,
        displayName: 'Own Member',
        clubId: club.clubId,
        ...AUDIT,
      }),
    );
    await withTransaction(scratch.db, (uow) =>
      people.register(uow, {
        organizationId,
        displayName: 'Other Club Member',
        clubId: otherClub.clubId,
        ...AUDIT,
      }),
    );
    await withTransaction(scratch.db, (uow) =>
      people.register(uow, { organizationId, displayName: 'No Club Member', ...AUDIT }),
    );

    const members = await people.listByClub(organizationId, club.clubId);
    expect(members.map((person) => person.personId)).toEqual([own.personId]);
    expect(members[0]?.clubId).toBe(club.clubId);
  });

  it('lists only the teams belonging to one club', async () => {
    const club = await withTransaction(scratch.db, (uow) =>
      participants.createClub(uow, { organizationId, name: 'Roster Club FC', ...AUDIT }),
    );
    const otherClub = await withTransaction(scratch.db, (uow) =>
      participants.createClub(uow, { organizationId, name: 'Another Roster Club', ...AUDIT }),
    );

    const ownTeam = await withTransaction(scratch.db, (uow) =>
      participants.createTeam(uow, {
        organizationId,
        clubId: club.clubId,
        name: 'Roster Club First Team',
        ...AUDIT,
      }),
    );
    await withTransaction(scratch.db, (uow) =>
      participants.createTeam(uow, {
        organizationId,
        clubId: otherClub.clubId,
        name: 'Another Roster Club Team',
        ...AUDIT,
      }),
    );

    const teams = await participants.listTeamsByClub(organizationId, club.clubId);
    expect(teams.map((team) => team.teamId)).toEqual([ownTeam.teamId]);
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

    // Ordered by key, and each value comes back as the type it was stored under —
    // a ranking must never resurface as the string "12".
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

  it('round-trips a club emblem reference', async () => {
    const participants = new EnrollmentRepository(scratch.db);

    const club = await withTransaction(scratch.db, (uow) =>
      participants.createClub(uow, {
        organizationId,
        name: 'Deportivo Godoy Cruz',
        ...AUDIT_CONTEXT,
      }),
    );
    expect(club.emblemObjectId).toBeUndefined();

    const objectMetadata = await withTransaction(scratch.db, (uow) =>
      new ObjectMetadataRepository(scratch.db).save(uow, {
        organizationId,
        profile: 'filesystem',
        storageKey: `${organizationId}/emblem.svg`,
        contentType: 'image/svg+xml',
        sizeBytes: 512,
        uploadedBy: AUDIT_CONTEXT.actor,
      }),
    );

    const updated = await withTransaction(scratch.db, (uow) =>
      participants.updateClub(uow, {
        clubId: club.clubId,
        organizationId,
        emblemObjectId: objectMetadata.objectId,
        ...AUDIT_CONTEXT,
      }),
    );
    expect(updated.emblemObjectId).toBe(objectMetadata.objectId);
    expect((await participants.findClub(club.clubId))?.emblemObjectId).toBe(
      objectMetadata.objectId,
    );
  });

  it('updates and clears a tournament emblem, preventing unreferenced delete while attached', async () => {
    const tournamentRepo = new TournamentRepository(scratch.db);
    const objectRepo = new ObjectMetadataRepository(scratch.db);
    const d = descriptor();

    const tournament = await withTransaction(scratch.db, async (uow) => {
      await tournamentRepo.saveDescriptor(uow, d, { organizationId, ...AUDIT });
      return tournamentRepo.create(uow, {
        organizationId,
        alias: 'torneo-emblem',
        name: 'Torneo Emblem',
        descriptor: d,
        ...AUDIT,
      });
    });
    expect(tournament.emblemObjectId).toBeUndefined();

    const objectMetadata = await withTransaction(scratch.db, (uow) =>
      objectRepo.save(uow, {
        organizationId,
        profile: 'filesystem',
        storageKey: `${organizationId}/tournament-emblem.png`,
        contentType: 'image/png',
        sizeBytes: 1024,
        uploadedBy: AUDIT.actor,
      }),
    );

    const updated = await withTransaction(scratch.db, (uow) =>
      tournamentRepo.updateEmblem(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        emblemObjectId: objectMetadata.objectId,
        ...AUDIT,
      }),
    );
    expect(updated.emblemObjectId).toBe(objectMetadata.objectId);

    // Deleting object while referenced must fail
    await expect(
      withTransaction(scratch.db, (uow) =>
        objectRepo.delete(uow, objectMetadata.objectId, {
          organizationId,
          ...AUDIT,
        }),
      ),
    ).rejects.toThrow(/tournament/);

    // Clearing emblem allows object delete
    const cleared = await withTransaction(scratch.db, (uow) =>
      tournamentRepo.updateEmblem(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        emblemObjectId: null,
        ...AUDIT,
      }),
    );
    expect(cleared.emblemObjectId).toBeUndefined();

    await expect(
      withTransaction(scratch.db, (uow) =>
        objectRepo.delete(uow, objectMetadata.objectId, {
          organizationId,
          ...AUDIT,
        }),
      ),
    ).resolves.toMatchObject({ objectId: objectMetadata.objectId });
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
