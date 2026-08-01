import {
  bindCapabilities,
  fixtureDescriptor,
  fixtureProfile,
  type MatchRuleset,
} from '@copalibre/domain';
import { createMigratedDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';
import { withTransaction } from '../transaction.js';
import { newId } from '../ids.js';
import { CompetitionRecordRepository } from './competition-record-repository.js';
import { CompetitionRepository } from './competition-repository.js';
import { OrganizationRepository } from './organization-repository.js';
import { TournamentProfileRepository } from './tournament-profile-repository.js';
import { TournamentRepository } from './tournament-repository.js';

const AUDIT = { actor: 'user:organizer-1', authorizationContext: 'scope:tournament.write' };

const football = () =>
  fixtureDescriptor({
    descriptorId: newId(),
    version: '3.0.0',
    statistics: [
      { code: 'goals-for', label: 'Goals For', aggregation: 'sum' },
      { code: 'goals-against', label: 'Goals Against', aggregation: 'sum' },
    ],
    scoringInputs: [],
  });

describe('competition record (integration)', () => {
  let scratch: ScratchDatabase;
  let organizationId = '';
  let records: CompetitionRecordRepository;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('record');
    records = new CompetitionRecordRepository(scratch.db);
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-registro',
        name: 'Liga Registro',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  async function seed(alias: string) {
    const descriptor = football();
    const profile = fixtureProfile({ profileId: newId() });
    const tournaments = new TournamentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const profiles = new TournamentProfileRepository(scratch.db);

    return withTransaction(scratch.db, async (uow) => {
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...AUDIT });
      await profiles.save(uow, profile, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias,
        name: alias,
        descriptor,
        ...AUDIT,
      });
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'League',
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
      if (!fixture) throw new Error('fixture not created');
      const match = await competition.createMatch(uow, {
        fixtureId: fixture.fixtureId,
        number: 1,
        organizationId,
        ...AUDIT,
      });
      return { descriptor, profile, tournament, stage, match };
    });
  }

  it('reads a compiled ruleset after its descriptor and profile rows are deleted', async () => {
    const { descriptor, profile, tournament } = await seed('copa-superviviente');
    const bound = bindCapabilities(descriptor, profile);
    if (!bound.ok) throw bound.error;

    const ruleset: MatchRuleset = {
      compiledFrom: {
        descriptorId: descriptor.descriptorId,
        descriptorVersion: descriptor.version,
      },
      config: { scoring: { pointsPerWin: 3 } },
      compiledAt: '2026-07-30T12:00:00.000Z',
      binding: bound.value,
    };

    await withTransaction(scratch.db, (uow) =>
      records.saveCompiledRuleset(uow, {
        tournamentId: tournament.tournamentId,
        ruleset,
        organizationId,
        ...AUDIT,
      }),
    );

    // Delete the modules the competition was built from.
    await scratch.db
      .deleteFrom('discipline_descriptors')
      .where('descriptor_id', '=', descriptor.descriptorId)
      .execute();
    await scratch.db
      .deleteFrom('tournament_profiles')
      .where('profile_id', '=', profile.profileId)
      .execute();

    const stored = await records.findCompiledRuleset(tournament.tournamentId);
    expect(stored?.config).toEqual({ scoring: { pointsPerWin: 3 } });
    expect(stored?.binding?.resolved).toHaveLength(2);
    // The resolution survives: capability -> discipline code, without the module.
    expect(stored?.binding?.resolved.find((r) => r.capability === 'primary-scoring')).toMatchObject(
      { resolvedTo: 'goals-for' },
    );
  });

  it('materialises standings inside the finalising transaction', async () => {
    const { tournament, stage, match } = await seed('copa-materializada');
    const competition = new CompetitionRepository(scratch.db);

    await withTransaction(scratch.db, async (uow) => {
      await competition.recordResult(uow, {
        matchId: match.matchId,
        result: {
          sides: [
            { entrantId: 'e1', statistics: { score: 2 } },
            { entrantId: 'e2', statistics: { score: 1 } },
          ],
          winnerEntrantId: 'e1',
          recordedAt: '2026-07-30T13:00:00.000Z',
        },
        organizationId,
        ...AUDIT,
      });
      await records.materialiseStandings(uow, {
        tournamentId: tournament.tournamentId,
        stageId: stage.stageId,
        matchId: match.matchId,
        rows: [{ entrantId: 'e1', rank: 1, points: 3 }],
        trace: [{ kind: 'comparator', id: 'goals-for', outcome: 'resolved' }],
        fullyResolved: true,
        organizationId,
        ...AUDIT,
      });
    });

    const latest = await records.latestStandings(stage.stageId);
    expect(latest).toMatchObject({ matchId: match.matchId, fullyResolved: true });
    expect(latest?.rows).toEqual([{ entrantId: 'e1', rank: 1, points: 3 }]);
    expect(latest?.trace[0]).toMatchObject({ id: 'goals-for' });
  });

  it('rolls back the standings when the finalising transaction fails', async () => {
    const { tournament, stage, match } = await seed('copa-rollback');

    await expect(
      withTransaction(scratch.db, async (uow) => {
        await records.materialiseStandings(uow, {
          tournamentId: tournament.tournamentId,
          stageId: stage.stageId,
          matchId: match.matchId,
          rows: [{ entrantId: 'e1', rank: 1 }],
          trace: [],
          fullyResolved: true,
          organizationId,
          ...AUDIT,
        });
        throw new Error('failure after materialisation');
      }),
    ).rejects.toThrow('failure after materialisation');

    await expect(records.latestStandings(stage.stageId)).resolves.toBeUndefined();
  });

  it('keeps a history of standings, one per finalised match', async () => {
    const { tournament, stage } = await seed('copa-historial');
    const competition = new CompetitionRepository(scratch.db);

    for (const round of [1, 2]) {
      const [fixture] = await withTransaction(scratch.db, (uow) =>
        competition.createFixtures(uow, {
          stageId: stage.stageId,
          fixtures: [{ round }],
          organizationId,
          ...AUDIT,
        }),
      );
      if (!fixture) throw new Error('fixture not created');
      const match = await withTransaction(scratch.db, (uow) =>
        competition.createMatch(uow, {
          fixtureId: fixture.fixtureId,
          number: round + 1,
          organizationId,
          ...AUDIT,
        }),
      );
      await withTransaction(scratch.db, (uow) =>
        records.materialiseStandings(uow, {
          tournamentId: tournament.tournamentId,
          stageId: stage.stageId,
          matchId: match.matchId,
          rows: [{ entrantId: 'e1', rank: 1, played: round }],
          trace: [],
          fullyResolved: true,
          organizationId,
          ...AUDIT,
        }),
      );
    }

    const history = await records.standingsHistory(stage.stageId);
    expect(history).toHaveLength(2);
    expect(history.map((entry) => (entry.rows[0] as { played: number }).played)).toEqual([1, 2]);
  });

  it('excludes versions used by started tournaments from the retirable list', async () => {
    const { descriptor, tournament } = await seed('copa-retiro');

    // Unstarted: the version is retirable.
    const before = await records.retirableDescriptorVersions();
    expect(before.some((entry) => entry.descriptorId === descriptor.descriptorId)).toBe(true);

    await scratch.db
      .updateTable('tournaments')
      .set({ status: 'started', started_at: new Date() })
      .where('tournament_id', '=', tournament.tournamentId)
      .execute();

    const after = await records.retirableDescriptorVersions();
    expect(after.some((entry) => entry.descriptorId === descriptor.descriptorId)).toBe(false);
  });
});
