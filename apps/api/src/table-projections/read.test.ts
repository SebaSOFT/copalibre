import { afterEach, describe, expect, it, vi } from 'vitest';
import { footballDescriptor, type DisciplineDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  StageReadModel,
  StatisticRepository,
  TournamentRepository,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import {
  latestFinalizedShirtNumbers,
  matchPublicIdentities,
  readPlayerStatisticsDrilldown,
  readTableProjection,
} from './read.js';

function fakeDb(tables: Record<string, readonly Record<string, unknown>[]>): Kysely<Database> {
  const query = (tableName: string) => {
    const chain = {
      innerJoin: () => chain,
      leftJoin: () => chain,
      select: () => chain,
      where: () => chain,
      execute: async () => tables[tableName] ?? [],
      executeTakeFirst: async () => (tables[tableName] ?? [])[0],
    };
    return chain;
  };
  return { selectFrom: query } as unknown as Kysely<Database>;
}

/** The ids the database rows of the stage-ordinal fixture carry for stage positions 1, 13 and 25. */
const STAGE_POSITION_MATCH_IDS: Readonly<Record<number, string>> = {
  1: '01936f4a-0016-7000-8000-000000000176',
  13: '01936f4a-0017-7000-8000-000000000187',
  25: '01936f4a-0019-7000-8000-0000000001a9',
};
function matchIdForStagePosition(position: number): string {
  return STAGE_POSITION_MATCH_IDS[position] ?? '';
}

describe('table-projections/read unit tests', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('assigns distinct 1-based stage ordinals for non-series matches that all share matches.number = 1', async () => {
    vi.spyOn(CompetitionRepository.prototype, 'listStagesOfTournament').mockResolvedValue([
      {
        stageId: '01936f4a-002a-7000-8000-0000000002ca',
        number: 1,
        name: 'Grupos',
        format: 'round-robin',
      } as never,
    ]);
    // Simulate a 25-match stage where the player appeared in matches at stage positions 1, 13, and 25.
    const stageRecords = Array.from({ length: 25 }, (_, i) => ({
      matchId: [1, 13, 25].includes(i + 1)
        ? matchIdForStagePosition(i + 1)
        : `01936f4a-0300-7000-8000-${String(i + 1).padStart(12, '0')}`,
      fixtureId: `01936f4a-0301-7000-8000-${String(i + 1).padStart(12, '0')}`,
      round: Math.floor(i / 5) + 1,
      position: (i % 5) + 1,
      status: 'finalized',
      games: [],
    }));
    vi.spyOn(StageReadModel.prototype, 'matches').mockResolvedValue(stageRecords as never);

    const db = fakeDb({
      matches: [
        {
          match_id: '01936f4a-0019-7000-8000-0000000001a9',
          number: 1,
          stage_id: '01936f4a-002a-7000-8000-0000000002ca',
        },
        {
          match_id: '01936f4a-0016-7000-8000-000000000176',
          number: 1,
          stage_id: '01936f4a-002a-7000-8000-0000000002ca',
        },
        {
          match_id: '01936f4a-0017-7000-8000-000000000187',
          number: 1,
          stage_id: '01936f4a-002a-7000-8000-0000000002ca',
        },
      ],
    });

    const identities = await matchPublicIdentities(db, '01936f4a-002c-7000-8000-0000000002ec', [
      '01936f4a-0019-7000-8000-0000000001a9',
      '01936f4a-0016-7000-8000-000000000176',
      '01936f4a-0017-7000-8000-000000000187',
    ]);

    expect(identities.get('01936f4a-0016-7000-8000-000000000176')).toEqual({
      stageNumber: 1,
      matchNumber: 1,
    });
    expect(identities.get('01936f4a-0017-7000-8000-000000000187')).toEqual({
      stageNumber: 1,
      matchNumber: 13,
    });
    expect(identities.get('01936f4a-0019-7000-8000-0000000001a9')).toEqual({
      stageNumber: 1,
      matchNumber: 25,
    });
  });

  it('orders drilldown rows by (stageNumber, ordinal), adds public summaries, and omits internal IDs', async () => {
    const descriptor: DisciplineDescriptor = {
      ...footballDescriptor(),
      tableLayouts: [
        {
          code: 'player-stats',
          target: 'player-ranking',
          label: { en: 'Player Stats' },
          entityGranularity: 'person',
          defaultSort: [{ columnCode: 'goals', direction: 'desc' }],
          columns: [
            {
              code: 'player',
              header: { en: 'Player' },
              source: { kind: 'actor-name' },
              format: 'text',
            },
            {
              code: 'goals',
              header: { en: 'Goals' },
              source: { kind: 'collector', code: 'goals-for' },
              format: 'number',
            },
            {
              code: 'appearances',
              header: { en: 'MP' },
              source: { kind: 'collector', code: 'appearances' },
              format: 'number',
            },
            {
              code: 'gpm',
              header: { en: 'G/M' },
              source: { kind: 'computed', expression: 'goals / max(appearances, 1)' },
              format: 'decimal-2',
            },
          ],
        },
      ],
      collectors: [
        {
          code: 'goals-for',
          label: { en: 'Goals' },
          source: { kind: 'event', definitionCodes: ['goal'], actorSource: 'primary' },
          measure: { kind: 'count' },
          granularity: { actor: 'person', competition: 'match' },
        },
        {
          code: 'appearances',
          label: { en: 'Appearances' },
          source: { kind: 'participation' },
          measure: { kind: 'count' },
          granularity: { actor: 'person', competition: 'match' },
        },
      ],
    };

    vi.spyOn(TournamentRepository.prototype, 'findDescriptor').mockResolvedValue(descriptor);
    vi.spyOn(TournamentRepository.prototype, 'findLatestRuleset').mockResolvedValue(undefined);
    vi.spyOn(CompetitionRepository.prototype, 'listFinalizedMatches').mockResolvedValue([
      '01936f4a-0019-7000-8000-0000000001a9',
      '01936f4a-0017-7000-8000-000000000187',
      '01936f4a-001e-7000-8000-0000000001fe',
      '01936f4a-0016-7000-8000-000000000176',
    ]);
    vi.spyOn(CompetitionRepository.prototype, 'listStagesOfTournament').mockResolvedValue([
      {
        stageId: '01936f4a-002a-7000-8000-0000000002ca',
        number: 1,
        name: 'Grupos',
        format: 'round-robin',
      } as never,
      {
        stageId: '01936f4a-002b-7000-8000-0000000002db',
        number: 2,
        name: 'Playoffs',
        format: 'single-elimination',
      } as never,
    ]);
    const groupRecords = Array.from({ length: 25 }, (_, i) => ({
      matchId: [1, 13, 25].includes(i + 1)
        ? matchIdForStagePosition(i + 1)
        : `01936f4a-0300-7000-8000-${String(i + 1).padStart(12, '0')}`,
      fixtureId: `01936f4a-0301-7000-8000-${String(i + 1).padStart(12, '0')}`,
      round: 1,
      position: i + 1,
      status: 'finalized',
      games: [],
    }));
    const qfRecords = [
      {
        matchId: '01936f4a-001e-7000-8000-0000000001fe',
        fixtureId: 'f-qf',
        round: 1,
        position: 1,
        status: 'finalized',
        games: [],
      },
    ];
    vi.spyOn(StageReadModel.prototype, 'matches').mockImplementation(async (stageId) =>
      stageId === '01936f4a-002a-7000-8000-0000000002ca'
        ? (groupRecords as never)
        : (qfRecords as never),
    );
    vi.spyOn(StatisticRepository.prototype, 'rawFigures').mockImplementation(async (query) => {
      const code = query.collectorCode;
      return [
        '01936f4a-0016-7000-8000-000000000176',
        '01936f4a-0017-7000-8000-000000000187',
        '01936f4a-0019-7000-8000-0000000001a9',
        '01936f4a-001e-7000-8000-0000000001fe',
      ].map((matchId) => ({
        collectorCode: code,
        actorGranularity: 'person',
        actorId: '01936f4a-0024-7000-8000-000000000264',
        competitionGranularity: 'match',
        competitionId: matchId,
        value:
          code === 'goals-for' ? (matchId === '01936f4a-0017-7000-8000-000000000187' ? 2 : 0) : 1,
        samples: 1,
      }));
    });
    vi.spyOn(EnrollmentRepository.prototype, 'resolveEntrantNames').mockResolvedValue(
      new Map([
        ['01936f4a-000e-7000-8000-0000000000ee', { name: 'Club Hispano', abbreviation: 'HIS' }],
      ]),
    );
    vi.spyOn(EnrollmentRepository.prototype, 'resolveEntrantPodiumDetails').mockResolvedValue(
      new Map([
        [
          '01936f4a-0010-7000-8000-000000000110',
          { name: 'Lomas de Rivadavia', abbreviation: 'LOM', clubAlias: 'lomas' },
        ],
        [
          '01936f4a-000d-7000-8000-0000000000dd',
          { name: 'Casa de Italia', abbreviation: 'CIT', clubAlias: 'casa-italia' },
        ],
        ['01936f4a-000c-7000-8000-0000000000cc', { name: 'Andes Talleres', abbreviation: 'AND' }],
        [
          '01936f4a-000f-7000-8000-0000000000ff',
          { name: 'Huracán', abbreviation: 'HUR', clubAlias: 'huracan' },
        ],
      ]),
    );

    const db = fakeDb({
      matches: [
        {
          match_id: '01936f4a-0019-7000-8000-0000000001a9',
          stage_id: '01936f4a-002a-7000-8000-0000000002ca',
          stage_number: 1,
          starts_at: '1763500000000',
          home_entrant_id: '01936f4a-000e-7000-8000-0000000000ee',
          away_entrant_id: '01936f4a-000c-7000-8000-0000000000cc',
          result: { sides: [{ statistics: { goals: 3 } }, { statistics: { goals: 1 } }] },
        },
        {
          match_id: '01936f4a-0016-7000-8000-000000000176',
          stage_id: '01936f4a-002a-7000-8000-0000000002ca',
          stage_number: 1,
          starts_at: '1763300000000',
          home_entrant_id: '01936f4a-0010-7000-8000-000000000110',
          away_entrant_id: '01936f4a-000e-7000-8000-0000000000ee',
          result: { sides: [{ statistics: { goals: 1 } }, { statistics: { goals: 2 } }] },
        },
        {
          match_id: '01936f4a-001e-7000-8000-0000000001fe',
          stage_id: '01936f4a-002b-7000-8000-0000000002db',
          stage_number: 2,
          starts_at: null,
          home_entrant_id: '01936f4a-000e-7000-8000-0000000000ee',
          away_entrant_id: '01936f4a-000f-7000-8000-0000000000ff',
          result: { sides: [{ statistics: { goals: 4 } }, { statistics: { goals: 2 } }] },
        },
        {
          match_id: '01936f4a-0017-7000-8000-000000000187',
          stage_id: '01936f4a-002a-7000-8000-0000000002ca',
          stage_number: 1,
          starts_at: '1763400000000',
          home_entrant_id: '01936f4a-000d-7000-8000-0000000000dd',
          away_entrant_id: '01936f4a-000e-7000-8000-0000000000ee',
          result: { sides: [{ statistics: { goals: 0 } }, { statistics: { goals: 2 } }] },
        },
      ],
      match_rosters: [
        {
          match_id: '01936f4a-0016-7000-8000-000000000176',
          entrant_id: '01936f4a-000e-7000-8000-0000000000ee',
          roster_members: [
            {
              personId: '01936f4a-0024-7000-8000-000000000264',
              name: 'Santiago Bello',
              number: 3,
              onField: true,
            },
          ],
        },
        {
          match_id: '01936f4a-0017-7000-8000-000000000187',
          entrant_id: '01936f4a-000e-7000-8000-0000000000ee',
          roster_members: [
            {
              personId: '01936f4a-0024-7000-8000-000000000264',
              name: 'Santiago Bello',
              number: 3,
              onField: true,
            },
          ],
        },
        {
          match_id: '01936f4a-0019-7000-8000-0000000001a9',
          entrant_id: '01936f4a-000e-7000-8000-0000000000ee',
          roster_members: [
            {
              personId: '01936f4a-0024-7000-8000-000000000264',
              name: 'Santiago Bello',
              number: 3,
              onField: true,
            },
          ],
        },
        {
          match_id: '01936f4a-001e-7000-8000-0000000001fe',
          entrant_id: '01936f4a-000e-7000-8000-0000000000ee',
          roster_members: [
            {
              personId: '01936f4a-0024-7000-8000-000000000264',
              name: 'Santiago Bello',
              number: 3,
              onField: true,
            },
          ],
        },
      ],
      entrants: [],
      persons: [],
      projection_versions: [{ version: 1 }],
    });

    const result = await readPlayerStatisticsDrilldown(
      db,
      {
        organizationId: '01936f4a-0020-7000-8000-000000000220',
        tournament: {
          tournamentId: '01936f4a-002c-7000-8000-0000000002ec',
          disciplineRef: { descriptorId: descriptor.descriptorId, version: descriptor.version },
        },
      },
      '01936f4a-0024-7000-8000-000000000264',
      'player-stats',
    );

    expect(result.matches.map((row) => row.match)).toEqual([
      { stageNumber: 1, matchNumber: 1 },
      { stageNumber: 1, matchNumber: 13 },
      { stageNumber: 1, matchNumber: 25 },
      { stageNumber: 2, matchNumber: 1 },
    ]);

    expect(result.matches[0]).toMatchObject({
      match: { stageNumber: 1, matchNumber: 1 },
      scheduledAt: new Date(1763300000000).toISOString(),
      side: 'away',
      opponentName: 'Lomas de Rivadavia',
      opponentAbbreviation: 'LOM',
      opponentClubAlias: 'lomas',
      ownScore: 2,
      opponentScore: 1,
    });
    expect(result.matches[2]?.opponentClubAlias).toBeUndefined();
    expect(result.matches[3]?.scheduledAt).toBeUndefined();
    for (const row of result.matches) {
      expect(row).not.toHaveProperty('matchId');
      expect(row).not.toHaveProperty('fixtureId');
      expect(row).not.toHaveProperty('entrantId');
    }
  });

  it('resolves shirtNumber from the latest finalized roster ordered by scheduledAt DESC, stage DESC, ordinal DESC and ignores empty numbers', async () => {
    vi.spyOn(CompetitionRepository.prototype, 'listFinalizedMatches').mockResolvedValue([
      '01936f4a-001d-7000-8000-0000000001ed',
      '01936f4a-001b-7000-8000-0000000001cb',
      '01936f4a-001c-7000-8000-0000000001dc',
      '01936f4a-001f-7000-8000-00000000020f',
    ]);
    vi.spyOn(CompetitionRepository.prototype, 'listStagesOfTournament').mockResolvedValue([
      {
        stageId: '01936f4a-002a-7000-8000-0000000002ca',
        number: 1,
        name: 'G',
        format: 'round-robin',
      } as never,
      {
        stageId: '01936f4a-002b-7000-8000-0000000002db',
        number: 2,
        name: 'K',
        format: 'single-elimination',
      } as never,
    ]);
    vi.spyOn(StageReadModel.prototype, 'matches').mockImplementation(async (stageId) =>
      stageId === '01936f4a-002a-7000-8000-0000000002ca'
        ? ([
            {
              matchId: '01936f4a-001d-7000-8000-0000000001ed',
              fixtureId: '01936f4a-0012-7000-8000-000000000132',
              round: 1,
              position: 1,
              status: 'finalized',
              games: [],
            },
            {
              matchId: '01936f4a-001c-7000-8000-0000000001dc',
              fixtureId: '01936f4a-0013-7000-8000-000000000143',
              round: 1,
              position: 2,
              status: 'finalized',
              games: [],
            },
          ] as never)
        : ([
            {
              matchId: '01936f4a-001f-7000-8000-00000000020f',
              fixtureId: '01936f4a-0014-7000-8000-000000000154',
              round: 1,
              position: 1,
              status: 'finalized',
              games: [],
            },
            {
              matchId: '01936f4a-001b-7000-8000-0000000001cb',
              fixtureId: '01936f4a-0015-7000-8000-000000000165',
              round: 1,
              position: 2,
              status: 'finalized',
              games: [],
            },
          ] as never),
    );

    const db = fakeDb({
      matches: [
        {
          match_id: '01936f4a-001d-7000-8000-0000000001ed',
          stage_number: 1,
          starts_at: '1763300000000',
        },
        {
          match_id: '01936f4a-001c-7000-8000-0000000001dc',
          stage_number: 1,
          starts_at: '1763400000000',
        },
        {
          match_id: '01936f4a-001b-7000-8000-0000000001cb',
          stage_number: 2,
          starts_at: '1763500000000',
        },
        { match_id: '01936f4a-001f-7000-8000-00000000020f', stage_number: 2, starts_at: null },
      ],
      match_rosters: [
        {
          match_id: '01936f4a-001d-7000-8000-0000000001ed',
          roster_members: [
            {
              personId: '01936f4a-0021-7000-8000-000000000231',
              number: 7,
              name: 'A',
              onField: true,
            },
            {
              personId: '01936f4a-0028-7000-8000-0000000002a8',
              number: '10',
              name: 'B',
              onField: true,
            },
            {
              personId: '01936f4a-0026-7000-8000-000000000286',
              number: '  ',
              name: 'C',
              onField: true,
            },
          ],
        },
        {
          match_id: '01936f4a-001c-7000-8000-0000000001dc',
          roster_members: [
            {
              personId: '01936f4a-0021-7000-8000-000000000231',
              number: 3,
              name: 'A',
              onField: true,
            },
          ],
        },
        {
          match_id: '01936f4a-001b-7000-8000-0000000001cb',
          roster_members: [
            {
              personId: '01936f4a-0021-7000-8000-000000000231',
              number: '',
              name: 'A',
              onField: true,
            },
          ],
        },
        {
          match_id: '01936f4a-001f-7000-8000-00000000020f',
          roster_members: [
            {
              personId: '01936f4a-0028-7000-8000-0000000002a8',
              number: '99',
              name: 'B',
              onField: true,
            },
          ],
        },
      ],
    });

    const numbers = await latestFinalizedShirtNumbers(db, {
      organizationId: '01936f4a-0020-7000-8000-000000000220',
      tournamentId: '01936f4a-002c-7000-8000-0000000002ec',
    });

    // 01936f4a-001b-7000-8000-0000000001cb has empty string so 01936f4a-0021-7000-8000-000000000231 falls back to 01936f4a-001c-7000-8000-0000000001dc (3) over 01936f4a-001d-7000-8000-0000000001ed (7);
    // 01936f4a-0028-7000-8000-0000000002a8 has 01936f4a-001d-7000-8000-0000000001ed (scheduled) ahead of 01936f4a-001f-7000-8000-00000000020f (nulls last), so gets '10';
    // 01936f4a-0026-7000-8000-000000000286 has only whitespace -> omitted.
    expect(numbers.get('01936f4a-0021-7000-8000-000000000231')).toBe(3);
    expect(numbers.get('01936f4a-0028-7000-8000-0000000002a8')).toBe('10');
    expect(numbers.has('01936f4a-0026-7000-8000-000000000286')).toBe(false);
  });

  it('populates clubAlias when resolved, filters by clubAlias ahead of clubId, and returns empty rows for unknown aliases', async () => {
    const descriptor: DisciplineDescriptor = {
      ...footballDescriptor(),
      tableLayouts: [
        {
          code: 'standings',
          target: 'group-phase',
          label: { en: 'Standings' },
          entityGranularity: 'team',
          defaultSort: [{ columnCode: 'points', direction: 'desc' }],
          columns: [
            {
              code: 'rank',
              header: { en: 'Pos' },
              source: { kind: 'rank' },
              format: 'number',
            },
            {
              code: 'name',
              header: { en: 'Team' },
              source: { kind: 'entrant-name' },
              format: 'text',
            },
            {
              code: 'points',
              header: { en: 'Pts' },
              source: { kind: 'collector', code: '01936f4a-0033-7000-8000-000000000363' },
              format: 'number',
            },
          ],
        },
      ],
      collectors: [
        {
          code: '01936f4a-0033-7000-8000-000000000363',
          label: { en: 'Points' },
          source: { kind: 'statistic', statisticCode: 'points' },
          measure: { kind: 'sum', field: 'points' },
          granularity: { actor: 'team', competition: 'stage' },
        },
      ],
    };

    vi.spyOn(TournamentRepository.prototype, 'findDescriptor').mockResolvedValue(descriptor);
    vi.spyOn(TournamentRepository.prototype, 'findLatestRuleset').mockResolvedValue(undefined);
    vi.spyOn(TournamentRepository.prototype, 'findLatestStageConfiguration').mockResolvedValue(
      undefined,
    );
    vi.spyOn(CompetitionRepository.prototype, 'listZonesOfStage').mockResolvedValue([]);
    vi.spyOn(StageReadModel.prototype, 'matches').mockResolvedValue([]);
    vi.spyOn(StatisticRepository.prototype, 'rawFigures').mockResolvedValue([
      {
        collectorCode: '01936f4a-0033-7000-8000-000000000363',
        actorGranularity: 'team',
        actorId: '01936f4a-000e-7000-8000-0000000000ee',
        competitionGranularity: 'stage',
        competitionId: '01936f4a-002a-7000-8000-0000000002ca',
        value: 9,
        samples: 3,
      },
      {
        collectorCode: '01936f4a-0033-7000-8000-000000000363',
        actorGranularity: 'team',
        actorId: '01936f4a-0011-7000-8000-000000000121',
        competitionGranularity: 'stage',
        competitionId: '01936f4a-002a-7000-8000-0000000002ca',
        value: 4,
        samples: 3,
      },
    ]);
    vi.spyOn(EnrollmentRepository.prototype, 'resolveEntrantNames').mockResolvedValue(
      new Map([
        ['01936f4a-000e-7000-8000-0000000000ee', { name: 'Club Hispano', abbreviation: 'HIS' }],
        ['01936f4a-0011-7000-8000-000000000121', { name: 'Sin Alias FC', abbreviation: 'SAF' }],
      ]),
    );
    vi.spyOn(EnrollmentRepository.prototype, 'resolveEntrantPodiumDetails').mockResolvedValue(
      new Map([
        [
          '01936f4a-000e-7000-8000-0000000000ee',
          {
            name: 'Club Hispano',
            abbreviation: 'HIS',
            clubId: 'club-hispano',
            clubAlias: 'club-hispano',
          },
        ],
        [
          '01936f4a-0011-7000-8000-000000000121',
          {
            name: 'Sin Alias FC',
            abbreviation: 'SAF',
            clubId: '01936f4a-0009-7000-8000-000000000099',
          },
        ],
      ]),
    );

    const dbForAlias = (resolvedClubId: string | undefined) =>
      ({
        selectFrom: (table: string) => {
          let filteredClubId: string | undefined;
          let filteredAlias: string | undefined;
          const chain = {
            innerJoin: () => chain,
            leftJoin: () => chain,
            select: () => chain,
            where: (col: string, _op: string, val: unknown) => {
              if (col === 'alias') filteredAlias = String(val);
              if (col === 'teams.club_id') filteredClubId = String(val);
              return chain;
            },
            execute: async () => {
              if (table === 'projection_versions') return [{ version: 1 }];
              if (table === 'entrants') {
                if (filteredClubId === 'club-hispano')
                  return [{ entrant_id: '01936f4a-000e-7000-8000-0000000000ee' }];
                if (filteredClubId === '01936f4a-0009-7000-8000-000000000099')
                  return [{ entrant_id: '01936f4a-0011-7000-8000-000000000121' }];
                return [];
              }
              return [];
            },
            executeTakeFirst: async () => {
              if (table === 'clubs') {
                return filteredAlias === 'club-hispano' && resolvedClubId
                  ? { club_id: resolvedClubId }
                  : undefined;
              }
              if (table === 'projection_versions') return { version: 1 };
              return undefined;
            },
          };
          return chain;
        },
      }) as unknown as Kysely<Database>;

    const scope = {
      organizationId: '01936f4a-0020-7000-8000-000000000220',
      tournament: {
        tournamentId: '01936f4a-002c-7000-8000-0000000002ec',
        disciplineRef: { descriptorId: descriptor.descriptorId, version: descriptor.version },
      },
      stageId: '01936f4a-002a-7000-8000-0000000002ca',
    };

    const unfiltered = await readTableProjection(dbForAlias('club-hispano'), scope, 'standings');
    expect(unfiltered.rows).toHaveLength(2);
    expect(unfiltered.rows[0]?.clubAlias).toBe('club-hispano');
    expect(unfiltered.rows[1]).not.toHaveProperty('clubAlias');

    // clubAlias wins over clubId when both are provided, preserving rank in full table.
    const byAlias = await readTableProjection(
      dbForAlias('club-hispano'),
      { ...scope, clubAlias: 'club-hispano', clubId: '01936f4a-0009-7000-8000-000000000099' },
      'standings',
    );
    expect(byAlias.rows).toHaveLength(1);
    expect(byAlias.rows[0]?.entrantId).toBe('01936f4a-000e-7000-8000-0000000000ee');
    expect(byAlias.rows[0]?.rank).toBe(1);
    expect(byAlias.rows[0]?.clubAlias).toBe('club-hispano');

    // Unknown alias (or alias from another org) returns layout columns and empty rows.
    const unknown = await readTableProjection(
      dbForAlias(undefined),
      { ...scope, clubAlias: 'other-org-club' },
      'standings',
    );
    expect(unknown.layout.columns.length).toBeGreaterThan(0);
    expect(unknown.rows).toEqual([]);
  });
});
