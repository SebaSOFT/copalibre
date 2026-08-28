import {
  CompetitionRepository,
  CompetitionRecordRepository,
  TournamentRepository,
  OrganizationRepository,
  EnrollmentRepository,
  withTransaction,
  newId,
} from '@copalibre/persistence';
import { createMigratedDatabase } from '../../../../packages/persistence/src/test-support/scratch-database.js';
import { readStandings } from './read.js';
import type { DisciplineDescriptor } from '@copalibre/domain';

const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;

/**
 * A duel discipline declaring the full derivable-statistics vocabulary
 * (`wins`/`draws`/`losses`/`points`) plus a `count`-aggregated `played` —
 * `read.integration.test.ts`'s own descriptor omits `wins`/`draws`/`losses`,
 * which this suite's assertions need named explicitly rather than inferred.
 */
function descriptor(): DisciplineDescriptor {
  return {
    descriptorId: newId(),
    version: '1.0.0',
    name: 'Liga de series (0160)',
    attribution: { author: 'CopaLibre', licence: 'AGPL-3.0-only' },
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 1, maxPlayers: 11 },
    segmentTypes: [],
    eventDefinitions: [],
    statistics: [
      { code: 'played', label: 'Partidos', aggregation: 'count' },
      { code: 'wins', label: 'Ganados', aggregation: 'sum' },
      { code: 'draws', label: 'Empatados', aggregation: 'sum' },
      { code: 'losses', label: 'Perdidos', aggregation: 'sum' },
      { code: 'points', label: 'Puntos', aggregation: 'sum' },
      { code: 'goals-for', label: 'A favor', aggregation: 'sum' },
    ],
    scoringInputs: [],
    availableFormats: ['single-elimination', 'round-robin'],
    notificationRuleCapabilities: [],
    winCondition: {},
    defaults: {},
    fieldPolicies: {
      format: { permission: { kind: 'replaced' }, mutationClass: 'requires_rebuild' },
      'series.span': { permission: { kind: 'replaced' }, mutationClass: 'requires_rebuild' },
      'series.resolutionClass': {
        permission: { kind: 'replaced' },
        mutationClass: 'blocked_after_results',
      },
      'series.standingsAccounting': {
        permission: { kind: 'replaced' },
        mutationClass: 'requires_rebuild',
      },
    },
  } as unknown as DisciplineDescriptor;
}

/**
 * One organization, one tournament, two entrants, one stage — the shared
 * shape every test in this suite needs, differing only in the ruleset's
 * `series.*` overrides and in how many games get a recorded result.
 */
async function seedTournament(
  db: Parameters<typeof withTransaction>[0],
  input: { readonly seriesOverrides?: Readonly<Record<string, unknown>> },
) {
  const disciplineDescriptor = descriptor();
  return withTransaction(db, async (uow) => {
    const organization = await new OrganizationRepository(db).create(uow, {
      alias: `org-${newId()}`,
      name: 'Org',
      ...AUDIT,
    });
    const organizationId = organization.organizationId;

    const tournaments = new TournamentRepository(db);
    await tournaments.saveDescriptor(uow, disciplineDescriptor, { organizationId, ...AUDIT });
    const tournament = await tournaments.create(uow, {
      alias: `tournament-${newId()}`,
      name: 'Tournament',
      descriptor: disciplineDescriptor,
      organizationId,
      ...AUDIT,
    });
    await tournaments.createRuleset(uow, {
      tournamentId: tournament.tournamentId,
      organizationId,
      descriptor: disciplineDescriptor,
      overrides: { format: 'single-elimination', ...input.seriesOverrides },
      ...AUDIT,
    });

    const enrollment = new EnrollmentRepository(db);
    const home = await enrollment.createTeam(uow, { name: 'Alfa', organizationId, ...AUDIT });
    const away = await enrollment.createTeam(uow, { name: 'Bravo', organizationId, ...AUDIT });
    const homeEntrant = await enrollment.registerEntrant(uow, {
      tournamentId: tournament.tournamentId,
      entrantRef: { kind: 'team', teamId: home.teamId },
      organizationId,
      ...AUDIT,
    });
    const awayEntrant = await enrollment.registerEntrant(uow, {
      tournamentId: tournament.tournamentId,
      entrantRef: { kind: 'team', teamId: away.teamId },
      organizationId,
      ...AUDIT,
    });

    const competition = new CompetitionRepository(db);
    const season = await competition.currentSeason(uow, {
      tournamentId: tournament.tournamentId,
      organizationId,
      ...AUDIT,
    });
    const stage = await competition.createStage(uow, {
      seasonId: season.seasonId,
      number: 1,
      name: 'Fase 1',
      format: 'single-elimination',
      organizationId,
      ...AUDIT,
    });
    const [fixture] = await competition.createFixtures(uow, {
      stageId: stage.stageId,
      fixtures: [
        { round: 1, homeEntrantId: homeEntrant.entrantId, awayEntrantId: awayEntrant.entrantId },
      ],
      organizationId,
      ...AUDIT,
    });
    if (!fixture) throw new Error('Fixture not created');

    return {
      organizationId,
      tournamentId: tournament.tournamentId,
      disciplineRef: tournament.disciplineRef,
      stageId: stage.stageId,
      fixtureId: fixture.fixtureId,
      homeEntrantId: homeEntrant.entrantId,
      awayEntrantId: awayEntrant.entrantId,
      competition,
    };
  });
}

/** Creates and finalizes one game of a fixture, `winner` taking it 2-1. */
async function playGame(
  db: Parameters<typeof withTransaction>[0],
  input: {
    readonly organizationId: string;
    readonly fixtureId: string;
    readonly number: number;
    readonly winnerEntrantId: string;
    readonly loserEntrantId: string;
  },
): Promise<string> {
  return withTransaction(db, async (uow) => {
    const competition = new CompetitionRepository(db);
    const match = await competition.createMatch(uow, {
      fixtureId: input.fixtureId,
      number: input.number,
      organizationId: input.organizationId,
      ...AUDIT,
    });
    await competition.recordResult(uow, {
      matchId: match.matchId,
      result: {
        sides: [
          { entrantId: input.winnerEntrantId, statistics: { 'goals-for': 2 } },
          { entrantId: input.loserEntrantId, statistics: { 'goals-for': 1 } },
        ],
        winnerEntrantId: input.winnerEntrantId,
        recordedAt: new Date().toISOString(),
      },
      organizationId: input.organizationId,
      ...AUDIT,
    });
    return match.matchId;
  });
}

describe('series accounting grain (integration, 0160)', () => {
  let scratch: Awaited<ReturnType<typeof createMigratedDatabase>>;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('accounting-grain');
  });

  afterAll(async () => {
    await scratch.db.destroy();
  });

  it('6.1: accounts a decided series as one result per side, with a counted total of one', async () => {
    const seeded = await seedTournament(scratch.db, {
      seriesOverrides: {
        'series.span': 3,
        'series.resolutionClass': 'best-of',
        'series.standingsAccounting': 'series',
      },
    });

    // A best-of-three decided in two: alfa sweeps, bravo's third game is
    // never played and contributes nothing.
    await playGame(scratch.db, {
      organizationId: seeded.organizationId,
      fixtureId: seeded.fixtureId,
      number: 1,
      winnerEntrantId: seeded.homeEntrantId,
      loserEntrantId: seeded.awayEntrantId,
    });
    await playGame(scratch.db, {
      organizationId: seeded.organizationId,
      fixtureId: seeded.fixtureId,
      number: 2,
      winnerEntrantId: seeded.homeEntrantId,
      loserEntrantId: seeded.awayEntrantId,
    });

    const standings = await readStandings(
      scratch.db,
      {
        tournamentId: seeded.tournamentId,
        disciplineRef: {
          descriptorId: seeded.disciplineRef.descriptorId,
          version: String(seeded.disciplineRef.version),
        },
      },
      1,
    );

    expect(standings.grain).toBe('series');
    const alfa = standings.rows.find((row) => row.entrantId === seeded.homeEntrantId);
    const bravo = standings.rows.find((row) => row.entrantId === seeded.awayEntrantId);
    expect(alfa?.statistics.wins).toBe(1);
    expect(alfa?.statistics.losses).toBe(0);
    expect(alfa?.statistics.played).toBe(1);
    expect(bravo?.statistics.wins).toBe(0);
    expect(bravo?.statistics.losses).toBe(1);
    expect(bravo?.statistics.played).toBe(1);
  });

  it('6.2: accounts every played match under match grain, with the unplayed game contributing nothing', async () => {
    const seeded = await seedTournament(scratch.db, {
      seriesOverrides: {
        'series.span': 3,
        'series.resolutionClass': 'best-of',
        'series.standingsAccounting': 'match',
      },
    });

    await playGame(scratch.db, {
      organizationId: seeded.organizationId,
      fixtureId: seeded.fixtureId,
      number: 1,
      winnerEntrantId: seeded.homeEntrantId,
      loserEntrantId: seeded.awayEntrantId,
    });
    await playGame(scratch.db, {
      organizationId: seeded.organizationId,
      fixtureId: seeded.fixtureId,
      number: 2,
      winnerEntrantId: seeded.homeEntrantId,
      loserEntrantId: seeded.awayEntrantId,
    });
    // Game 3 is never created — the series decided in two, so nothing exists
    // to record a result against, matching how an anulled game reaches this
    // read path in production (no result, so `outcomes()` never selects it).

    const standings = await readStandings(
      scratch.db,
      {
        tournamentId: seeded.tournamentId,
        disciplineRef: {
          descriptorId: seeded.disciplineRef.descriptorId,
          version: String(seeded.disciplineRef.version),
        },
      },
      1,
    );

    expect(standings.grain).toBe('match');
    const alfa = standings.rows.find((row) => row.entrantId === seeded.homeEntrantId);
    expect(alfa?.statistics.wins).toBe(2);
    expect(alfa?.statistics.played).toBe(2);
  });

  it('6.3: a stage declaring no series reports no grain and is unchanged from before this change', async () => {
    const seeded = await seedTournament(scratch.db, { seriesOverrides: {} });

    await playGame(scratch.db, {
      organizationId: seeded.organizationId,
      fixtureId: seeded.fixtureId,
      number: 1,
      winnerEntrantId: seeded.homeEntrantId,
      loserEntrantId: seeded.awayEntrantId,
    });

    const standings = await readStandings(
      scratch.db,
      {
        tournamentId: seeded.tournamentId,
        disciplineRef: {
          descriptorId: seeded.disciplineRef.descriptorId,
          version: String(seeded.disciplineRef.version),
        },
      },
      1,
    );

    expect('grain' in standings).toBe(false);
    const alfa = standings.rows.find((row) => row.entrantId === seeded.homeEntrantId);
    expect(alfa?.statistics.wins).toBe(1);
    expect(alfa?.statistics.played).toBe(1);
  });

  it('6.4: returns a stored snapshot verbatim, reported as match grain rather than recomputed', async () => {
    const seeded = await seedTournament(scratch.db, {
      seriesOverrides: {
        'series.span': 3,
        'series.resolutionClass': 'best-of',
        'series.standingsAccounting': 'series',
      },
    });
    const matchId = await playGame(scratch.db, {
      organizationId: seeded.organizationId,
      fixtureId: seeded.fixtureId,
      number: 1,
      winnerEntrantId: seeded.homeEntrantId,
      loserEntrantId: seeded.awayEntrantId,
    });

    const scope = {
      tournamentId: seeded.tournamentId,
      disciplineRef: {
        descriptorId: seeded.disciplineRef.descriptorId,
        version: String(seeded.disciplineRef.version),
      },
    };
    const live = await readStandings(scratch.db, scope, 1);

    // Simulates a snapshot written before this feature: computed and stored
    // with no awareness of the grain, the same as `materialiseStandings`'s
    // only caller today (this suite) — there is still no production writer.
    await withTransaction(scratch.db, (uow) =>
      new CompetitionRecordRepository(scratch.db).materialiseStandings(uow, {
        tournamentId: seeded.tournamentId,
        stageId: seeded.stageId,
        matchId,
        rows: live.rows as unknown as Parameters<
          InstanceType<typeof CompetitionRecordRepository>['materialiseStandings']
        >[1]['rows'],
        trace: live.rawTrace as unknown as Parameters<
          InstanceType<typeof CompetitionRecordRepository>['materialiseStandings']
        >[1]['trace'],
        fullyResolved: live.fullyResolved,
        organizationId: seeded.organizationId,
        ...AUDIT,
      }),
    );

    // A second game, played after the snapshot, would change a live
    // recomputation — proving the stored path never recomputes.
    await playGame(scratch.db, {
      organizationId: seeded.organizationId,
      fixtureId: seeded.fixtureId,
      number: 2,
      winnerEntrantId: seeded.homeEntrantId,
      loserEntrantId: seeded.awayEntrantId,
    });

    const stored = await readStandings(scratch.db, scope, 1);
    expect(stored.rows).toEqual(live.rows);
    expect(stored.grain).toBe('match');
  });
});
