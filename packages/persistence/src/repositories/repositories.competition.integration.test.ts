import { AuditReader } from '../audit.js';
import { InvariantViolationError, NotFoundError } from '../errors.js';
import { newId } from '../ids.js';
import { type ScratchDatabase } from '../test-support/scratch-database.js';
import { withTransaction } from '../transaction.js';
import { CompetitionRepository } from './competition-repository.js';
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

  it('replaces a stage’s fixtures wholesale when nothing has started', async () => {
    const disciplineDescriptor = descriptor();
    const { stageId, entrantIds } = await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, disciplineDescriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-reseed',
        name: 'Copa Reseed',
        descriptor: disciplineDescriptor,
        ...AUDIT,
      });
      const ids: string[] = [];
      for (const name of ['Orbital A', 'Orbital B', 'Orbital C']) {
        const team = await participants.createTeam(uow, { organizationId, name, ...AUDIT });
        const entrant = await participants.registerEntrant(uow, {
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          organizationId,
          ...AUDIT,
        });
        ids.push(entrant.entrantId);
      }
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Group Stage',
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      });
      await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [{ round: 1, homeEntrantId: ids[0], awayEntrantId: ids[1] }],
        organizationId,
        ...AUDIT,
      });
      return { stageId: stage.stageId, entrantIds: ids };
    });

    const replaced = await withTransaction(scratch.db, (uow) =>
      competition.replaceFixtures(uow, {
        stageId,
        fixtures: [{ round: 1, homeEntrantId: entrantIds[1], awayEntrantId: entrantIds[2] }],
        organizationId,
        ...AUDIT,
      }),
    );

    expect(replaced).toHaveLength(1);
    expect(replaced[0]).toMatchObject({
      homeEntrantId: entrantIds[1],
      awayEntrantId: entrantIds[2],
    });

    const remaining = await scratch.db
      .selectFrom('fixtures')
      .selectAll()
      .where('stage_id', '=', stageId)
      .execute();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.home_entrant_id).toBe(entrantIds[1]);

    const audit = await new AuditReader(scratch.db).historyFor('stage', stageId);
    expect(audit.map((entry) => entry.action)).toContain('fixtures.regenerated');
  });

  it('replaces fixtures when matches are scheduled, and refuses once a match has started', async () => {
    const disciplineDescriptor = descriptor();
    const { stageId, entrantId } = await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, disciplineDescriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-reseed-bloqueada',
        name: 'Copa Reseed Bloqueada',
        descriptor: disciplineDescriptor,
        ...AUDIT,
      });
      const team = await participants.createTeam(uow, {
        organizationId,
        name: 'Orbital Bloqueado',
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
      return { stageId: stage.stageId, entrantId: entrant.entrantId };
    });

    // 1. Matches are materialized and scheduled; replacing fixtures succeeds
    const replaced = await withTransaction(scratch.db, (uow) =>
      competition.replaceFixtures(uow, {
        stageId,
        fixtures: [{ round: 1, homeEntrantId: entrantId }],
        organizationId,
        ...AUDIT,
      }),
    );
    expect(replaced).toHaveLength(1);
    const newFixture = replaced[0];
    if (!newFixture) throw new Error('no fixture replaced');
    const newFixtureId = newFixture.fixtureId;

    // Verify exactly one match was created for the new fixture
    const matchesAfterReplace = await scratch.db
      .selectFrom('matches')
      .selectAll()
      .where('fixture_id', '=', newFixtureId)
      .execute();
    expect(matchesAfterReplace).toHaveLength(1);
    const firstMatch = matchesAfterReplace[0];
    if (!firstMatch) throw new Error('no match created');
    expect(firstMatch.status).toBe('scheduled');

    // 2. Start the match (status -> in-progress)
    const matchId = firstMatch.match_id;
    await withTransaction(scratch.db, (uow) =>
      competition.applyCommand(uow, {
        matchId,
        command: 'start',
        status: 'in-progress',
        grantedBy: 'official:1',
        organizationId,
        ...AUDIT,
      }),
    );

    // 3. Now replacing fixtures must be refused
    await expect(
      withTransaction(scratch.db, (uow) =>
        competition.replaceFixtures(uow, {
          stageId,
          fixtures: [{ round: 1, homeEntrantId: entrantId }],
          organizationId,
          ...AUDIT,
        }),
      ),
    ).rejects.toBeInstanceOf(InvariantViolationError);

    // Nothing was touched: the fixture is still there.
    const remaining = await scratch.db
      .selectFrom('fixtures')
      .selectAll()
      .where('stage_id', '=', stageId)
      .execute();
    expect(remaining.map((row) => row.fixture_id)).toEqual([newFixtureId]);
  });

  it('createMatch is idempotent and createFixtures materializes match 1', async () => {
    const disciplineDescriptor = descriptor();
    const { fixtureId } = await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, disciplineDescriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-idempotent-match',
        name: 'Copa Idempotent Match',
        descriptor: disciplineDescriptor,
        ...AUDIT,
      });
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Stage 1',
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
      return { fixtureId: fixture.fixtureId };
    });

    // createFixtures already materialized match 1
    const initialMatches = await scratch.db
      .selectFrom('matches')
      .selectAll()
      .where('fixture_id', '=', fixtureId)
      .execute();
    expect(initialMatches).toHaveLength(1);
    const firstInitial = initialMatches[0];
    if (!firstInitial) throw new Error('no initial match');
    expect(firstInitial.number).toBe(1);
    const initialMatchId = firstInitial.match_id;

    // createMatch for match 1 returns existing match and does NOT insert or audit again
    const secondCall = await withTransaction(scratch.db, (uow) =>
      competition.createMatch(uow, {
        fixtureId,
        number: 1,
        organizationId,
        ...AUDIT,
      }),
    );
    expect(secondCall.matchId).toBe(initialMatchId);

    const matchesAfter = await scratch.db
      .selectFrom('matches')
      .selectAll()
      .where('fixture_id', '=', fixtureId)
      .execute();
    expect(matchesAfter).toHaveLength(1);
  });

  it('refuses to replace fixtures with an empty set', async () => {
    await expect(
      withTransaction(scratch.db, (uow) =>
        competition.replaceFixtures(uow, {
          stageId: newId(),
          fixtures: [],
          organizationId,
          ...AUDIT,
        }),
      ),
    ).rejects.toBeInstanceOf(InvariantViolationError);
  });

  it('persists explicit zones/groups and reuses a stage implicit scope', async () => {
    const descriptorDocument = descriptor();
    const result = await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptorDocument, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-zonas',
        name: 'Copa Zonas',
        descriptor: descriptorDocument,
        ...AUDIT,
      });
      const explicitStage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Fase explícita',
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      });
      const zone = await competition.createZone(uow, {
        stageId: explicitStage.stageId,
        number: 1,
        name: 'Zona Norte',
        organizationId,
        ...AUDIT,
      });
      const group = await competition.createGroup(uow, {
        zoneId: zone.zoneId,
        number: 1,
        name: 'Grupo A',
        organizationId,
        ...AUDIT,
      });
      const implicitStage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 2,
        name: 'Fase implícita',
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      });
      const first = await competition.createFixtures(uow, {
        stageId: implicitStage.stageId,
        fixtures: [{ round: 1 }],
        organizationId,
        ...AUDIT,
      });
      const second = await competition.createFixtures(uow, {
        stageId: implicitStage.stageId,
        fixtures: [{ round: 2 }],
        organizationId,
        ...AUDIT,
      });
      return { explicitStage, zone, group, first, second };
    });

    await expect(competition.listZonesOfStage(result.explicitStage.stageId)).resolves.toEqual([
      result.zone,
    ]);
    await expect(competition.listGroupsOfZone(result.zone.zoneId)).resolves.toEqual([result.group]);
    expect(result.first[0]?.zoneId).toBe(result.second[0]?.zoneId);
    expect(result.first[0]?.groupId).toBe(result.second[0]?.groupId);
  });

  it('stores a zone format, clears it back to inheritance, and locks it once fixtures exist', async () => {
    const descriptorDocument = descriptor();
    const setup = await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptorDocument, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-formato-zona',
        name: 'Copa Formato Zona',
        descriptor: descriptorDocument,
        ...AUDIT,
      });
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Fase mixta',
        format: 'single-elimination',
        organizationId,
        ...AUDIT,
      });
      const inheriting = await competition.createZone(uow, {
        stageId: stage.stageId,
        number: 1,
        name: 'Zona 1',
        organizationId,
        ...AUDIT,
      });
      const declared = await competition.createZone(uow, {
        stageId: stage.stageId,
        number: 2,
        name: 'Zona 2',
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      });
      return { stage, inheriting, declared };
    });

    expect(setup.inheriting.format).toBeUndefined();
    expect(setup.declared.format).toBe('round-robin');

    const set = await withTransaction(scratch.db, (uow) =>
      competition.setZoneFormat(uow, {
        zoneId: setup.inheriting.zoneId,
        format: 'league',
        organizationId,
        ...AUDIT,
      }),
    );
    expect(set.format).toBe('league');
    await expect(competition.findZoneById(setup.inheriting.zoneId)).resolves.toMatchObject({
      format: 'league',
    });

    const cleared = await withTransaction(scratch.db, (uow) =>
      competition.setZoneFormat(uow, {
        zoneId: setup.inheriting.zoneId,
        format: null,
        organizationId,
        ...AUDIT,
      }),
    );
    expect(cleared.format).toBeUndefined();
    const [first, second] = await competition.listZonesOfStage(setup.stage.stageId);
    expect(first?.format).toBeUndefined();
    expect(second?.format).toBe('round-robin');

    const audited = await scratch.db
      .selectFrom('audit_log')
      .select('action')
      .where('entity_id', '=', setup.inheriting.zoneId)
      .where('action', '=', 'zone.format-set')
      .execute();
    expect(audited).toHaveLength(2);

    await expect(
      withTransaction(scratch.db, (uow) =>
        competition.setZoneFormat(uow, {
          zoneId: newId(),
          format: 'league',
          organizationId,
          ...AUDIT,
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    await withTransaction(scratch.db, (uow) =>
      competition.createFixtures(uow, {
        stageId: setup.stage.stageId,
        fixtures: [{ round: 1 }],
        organizationId,
        ...AUDIT,
      }),
    );
    await expect(
      withTransaction(scratch.db, (uow) =>
        competition.setZoneFormat(uow, {
          zoneId: setup.declared.zoneId,
          format: null,
          organizationId,
          ...AUDIT,
        }),
      ),
    ).rejects.toBeInstanceOf(InvariantViolationError);
    await expect(competition.findZoneById(setup.declared.zoneId)).resolves.toMatchObject({
      format: 'round-robin',
    });
  });

  it('upserts a zone promotion plan and records its declared rule in the audit trail', async () => {
    const descriptorDocument = descriptor();
    const result = await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptorDocument, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-promocion',
        name: 'Copa Promoción',
        descriptor: descriptorDocument,
        ...AUDIT,
      });
      const source = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Grupos',
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      });
      const destination = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 2,
        name: 'Final',
        format: 'single-elimination',
        organizationId,
        ...AUDIT,
      });
      const zone = await competition.createZone(uow, {
        stageId: source.stageId,
        number: 1,
        name: 'Zona Norte',
        organizationId,
        ...AUDIT,
      });
      const first = await competition.createPromotionPlan(uow, {
        zoneId: zone.zoneId,
        nextStageId: destination.stageId,
        plan: { perGroupAdvance: 2, combination: { mode: 'group-order' } },
        organizationId,
        ...AUDIT,
      });
      const replacement = await competition.createPromotionPlan(uow, {
        zoneId: zone.zoneId,
        nextStageId: destination.stageId,
        plan: { perGroupAdvance: 1, combination: { mode: 'group-order' } },
        organizationId,
        ...AUDIT,
      });
      return { zone, first, replacement };
    });

    expect(result.replacement.promotionPlanId).toBe(result.first.promotionPlanId);
    await expect(competition.findPromotionPlan(result.zone.zoneId)).resolves.toMatchObject({
      promotionPlanId: result.first.promotionPlanId,
      zoneId: result.zone.zoneId,
      plan: { perGroupAdvance: 1, combination: { mode: 'group-order' } },
    });
    const audits = await scratch.db
      .selectFrom('audit_log')
      .select('action')
      .where('entity_id', '=', result.zone.zoneId)
      .where('action', '=', 'promotion-plan.saved')
      .execute();
    expect(audits).toHaveLength(2);
  });

  it('records automatic draw metadata and leaves manual placement metadata empty', async () => {
    const descriptorDocument = descriptor();
    const result = await withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptorDocument, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-sorteo-zonas',
        name: 'Copa Sorteo Zonas',
        descriptor: descriptorDocument,
        ...AUDIT,
      });
      const entrantIds: string[] = [];
      for (const name of ['Andes', 'Caucete', 'Pocito', 'Rawson']) {
        const team = await participants.createTeam(uow, { organizationId, name, ...AUDIT });
        const entrant = await participants.registerEntrant(uow, {
          tournamentId: tournament.tournamentId,
          entrantRef: { kind: 'team', teamId: team.teamId },
          organizationId,
          ...AUDIT,
        });
        entrantIds.push(entrant.entrantId);
      }
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'Fase de sorteo',
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      });
      const constraints = [
        {
          kind: 'separation' as const,
          hook: 'draw.assign-group' as const,
          attribute: 'region',
          scope: 'group' as const,
        },
      ];
      const zones = await competition.assignZones(uow, {
        stageId: stage.stageId,
        assignment: {
          groups: {
            [entrantIds[0] as string]: 1,
            [entrantIds[1] as string]: 2,
            [entrantIds[2] as string]: 1,
            [entrantIds[3] as string]: 2,
          },
        },
        constraints,
        zoneCount: 2,
        seed: 91,
        organizationId,
        ...AUDIT,
      });
      const automaticGroups = await competition.assignGroups(uow, {
        zoneId: zones.entities[0]?.zoneId as string,
        assignment: {
          groups: {
            [entrantIds[0] as string]: 1,
            [entrantIds[2] as string]: 2,
          },
        },
        constraints,
        groupCount: 2,
        seed: 92,
        organizationId,
        ...AUDIT,
      });
      const manualGroups = await competition.assignGroupsManually(uow, {
        zoneId: zones.entities[1]?.zoneId as string,
        assignment: {
          groups: {
            [entrantIds[1] as string]: 1,
            [entrantIds[3] as string]: 2,
          },
        },
        groupCount: 2,
        organizationId,
        ...AUDIT,
      });
      return { zones, automaticGroups, manualGroups, entrantIds };
    });

    const zoneRows = await scratch.db
      .selectFrom('zones')
      .select(['draw_seed', 'draw_constraints'])
      .where(
        'zone_id',
        'in',
        result.zones.entities.map((zone) => zone.zoneId),
      )
      .orderBy('number')
      .execute();
    const automaticRows = await scratch.db
      .selectFrom('groups')
      .select(['draw_seed', 'draw_constraints'])
      .where(
        'group_id',
        'in',
        result.automaticGroups.entities.map((group) => group.groupId),
      )
      .execute();
    const manualRows = await scratch.db
      .selectFrom('groups')
      .select(['draw_seed', 'draw_constraints'])
      .where(
        'group_id',
        'in',
        result.manualGroups.entities.map((group) => group.groupId),
      )
      .execute();

    expect(zoneRows).toEqual(
      expect.arrayContaining([expect.objectContaining({ draw_constraints: expect.any(Array) })]),
    );
    expect(zoneRows.map((row) => Number(row.draw_seed))).toEqual([91, 91]);
    expect(automaticRows).toEqual(
      expect.arrayContaining([expect.objectContaining({ draw_constraints: expect.any(Array) })]),
    );
    expect(automaticRows.map((row) => Number(row.draw_seed))).toEqual([92, 92]);
    expect(manualRows).toEqual([
      { draw_seed: null, draw_constraints: null },
      { draw_seed: null, draw_constraints: null },
    ]);
    await expect(
      competition.listEntrantIdsOfZone(result.zones.entities[0]?.zoneId as string),
    ).resolves.toEqual([result.entrantIds[0], result.entrantIds[2]].sort());
    await expect(
      competition.listEntrantIdsOfGroup(result.automaticGroups.entities[0]?.groupId as string),
    ).resolves.toEqual([result.entrantIds[0]]);
    await expect(
      competition.listEntrantIdsOfGroup(result.manualGroups.entities[1]?.groupId as string),
    ).resolves.toEqual([result.entrantIds[3]]);
  });
});
