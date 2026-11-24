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

describe('table-projections/read unit tests', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('assigns distinct 1-based stage ordinals for non-series matches that all share matches.number = 1', async () => {
    vi.spyOn(CompetitionRepository.prototype, 'listStagesOfTournament').mockResolvedValue([
      { stageId: 'st-1', number: 1, name: 'Grupos', format: 'round-robin' } as never,
    ]);
    // Simulate a 25-match stage where the player appeared in matches at stage positions 1, 13, and 25.
    const stageRecords = Array.from({ length: 25 }, (_, i) => ({
      matchId: `m-${i + 1}`,
      fixtureId: `f-${i + 1}`,
      round: Math.floor(i / 5) + 1,
      position: (i % 5) + 1,
      status: 'finalized',
      games: [],
    }));
    vi.spyOn(StageReadModel.prototype, 'matches').mockResolvedValue(stageRecords as never);

    const db = fakeDb({
      matches: [
        { match_id: 'm-25', number: 1, stage_id: 'st-1' },
        { match_id: 'm-1', number: 1, stage_id: 'st-1' },
        { match_id: 'm-13', number: 1, stage_id: 'st-1' },
      ],
    });

    const identities = await matchPublicIdentities(db, 't-1', ['m-25', 'm-1', 'm-13']);

    expect(identities.get('m-1')).toEqual({ stageNumber: 1, matchNumber: 1 });
    expect(identities.get('m-13')).toEqual({ stageNumber: 1, matchNumber: 13 });
    expect(identities.get('m-25')).toEqual({ stageNumber: 1, matchNumber: 25 });
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
      'm-25',
      'm-13',
      'm-qf',
      'm-1',
    ]);
    vi.spyOn(CompetitionRepository.prototype, 'listStagesOfTournament').mockResolvedValue([
      { stageId: 'st-1', number: 1, name: 'Grupos', format: 'round-robin' } as never,
      { stageId: 'st-2', number: 2, name: 'Playoffs', format: 'single-elimination' } as never,
    ]);
    const groupRecords = Array.from({ length: 25 }, (_, i) => ({
      matchId: `m-${i + 1}`,
      fixtureId: `f-${i + 1}`,
      round: 1,
      position: i + 1,
      status: 'finalized',
      games: [],
    }));
    const qfRecords = [
      { matchId: 'm-qf', fixtureId: 'f-qf', round: 1, position: 1, status: 'finalized', games: [] },
    ];
    vi.spyOn(StageReadModel.prototype, 'matches').mockImplementation(async (stageId) =>
      stageId === 'st-1' ? (groupRecords as never) : (qfRecords as never),
    );
    vi.spyOn(StatisticRepository.prototype, 'rawFigures').mockImplementation(async (query) => {
      const code = query.collectorCode;
      return ['m-1', 'm-13', 'm-25', 'm-qf'].map((matchId) => ({
        collectorCode: code,
        actorGranularity: 'person',
        actorId: 'p-bello',
        competitionGranularity: 'match',
        competitionId: matchId,
        value: code === 'goals-for' ? (matchId === 'm-13' ? 2 : 0) : 1,
        samples: 1,
      }));
    });
    vi.spyOn(EnrollmentRepository.prototype, 'resolveEntrantNames').mockResolvedValue(
      new Map([['en-hispano', { name: 'Club Hispano', abbreviation: 'HIS' }]]),
    );
    vi.spyOn(EnrollmentRepository.prototype, 'resolveEntrantPodiumDetails').mockResolvedValue(
      new Map([
        ['en-lomas', { name: 'Lomas de Rivadavia', abbreviation: 'LOM', clubAlias: 'lomas' }],
        [
          'en-casaitalia',
          { name: 'Casa de Italia', abbreviation: 'CIT', clubAlias: 'casa-italia' },
        ],
        ['en-andes', { name: 'Andes Talleres', abbreviation: 'AND' }],
        ['en-huracan', { name: 'Huracán', abbreviation: 'HUR', clubAlias: 'huracan' }],
      ]),
    );

    const db = fakeDb({
      matches: [
        {
          match_id: 'm-25',
          stage_id: 'st-1',
          stage_number: 1,
          starts_at: '1763500000000',
          home_entrant_id: 'en-hispano',
          away_entrant_id: 'en-andes',
          result: { sides: [{ statistics: { goals: 3 } }, { statistics: { goals: 1 } }] },
        },
        {
          match_id: 'm-1',
          stage_id: 'st-1',
          stage_number: 1,
          starts_at: '1763300000000',
          home_entrant_id: 'en-lomas',
          away_entrant_id: 'en-hispano',
          result: { sides: [{ statistics: { goals: 1 } }, { statistics: { goals: 2 } }] },
        },
        {
          match_id: 'm-qf',
          stage_id: 'st-2',
          stage_number: 2,
          starts_at: null,
          home_entrant_id: 'en-hispano',
          away_entrant_id: 'en-huracan',
          result: { sides: [{ statistics: { goals: 4 } }, { statistics: { goals: 2 } }] },
        },
        {
          match_id: 'm-13',
          stage_id: 'st-1',
          stage_number: 1,
          starts_at: '1763400000000',
          home_entrant_id: 'en-casaitalia',
          away_entrant_id: 'en-hispano',
          result: { sides: [{ statistics: { goals: 0 } }, { statistics: { goals: 2 } }] },
        },
      ],
      match_rosters: [
        {
          match_id: 'm-1',
          entrant_id: 'en-hispano',
          roster_members: [
            { personId: 'p-bello', name: 'Santiago Bello', number: 3, onField: true },
          ],
        },
        {
          match_id: 'm-13',
          entrant_id: 'en-hispano',
          roster_members: [
            { personId: 'p-bello', name: 'Santiago Bello', number: 3, onField: true },
          ],
        },
        {
          match_id: 'm-25',
          entrant_id: 'en-hispano',
          roster_members: [
            { personId: 'p-bello', name: 'Santiago Bello', number: 3, onField: true },
          ],
        },
        {
          match_id: 'm-qf',
          entrant_id: 'en-hispano',
          roster_members: [
            { personId: 'p-bello', name: 'Santiago Bello', number: 3, onField: true },
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
        organizationId: 'org-1',
        tournament: {
          tournamentId: 't-1',
          disciplineRef: { descriptorId: descriptor.descriptorId, version: descriptor.version },
        },
      },
      'p-bello',
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
      'm-old',
      'm-late-empty',
      'm-mid',
      'm-unsched-hi',
    ]);
    vi.spyOn(CompetitionRepository.prototype, 'listStagesOfTournament').mockResolvedValue([
      { stageId: 'st-1', number: 1, name: 'G', format: 'round-robin' } as never,
      { stageId: 'st-2', number: 2, name: 'K', format: 'single-elimination' } as never,
    ]);
    vi.spyOn(StageReadModel.prototype, 'matches').mockImplementation(async (stageId) =>
      stageId === 'st-1'
        ? ([
            {
              matchId: 'm-old',
              fixtureId: 'f-1',
              round: 1,
              position: 1,
              status: 'finalized',
              games: [],
            },
            {
              matchId: 'm-mid',
              fixtureId: 'f-2',
              round: 1,
              position: 2,
              status: 'finalized',
              games: [],
            },
          ] as never)
        : ([
            {
              matchId: 'm-unsched-hi',
              fixtureId: 'f-3',
              round: 1,
              position: 1,
              status: 'finalized',
              games: [],
            },
            {
              matchId: 'm-late-empty',
              fixtureId: 'f-4',
              round: 1,
              position: 2,
              status: 'finalized',
              games: [],
            },
          ] as never),
    );

    const db = fakeDb({
      matches: [
        { match_id: 'm-old', stage_number: 1, starts_at: '1763300000000' },
        { match_id: 'm-mid', stage_number: 1, starts_at: '1763400000000' },
        { match_id: 'm-late-empty', stage_number: 2, starts_at: '1763500000000' },
        { match_id: 'm-unsched-hi', stage_number: 2, starts_at: null },
      ],
      match_rosters: [
        {
          match_id: 'm-old',
          roster_members: [
            { personId: 'p-1', number: 7, name: 'A', onField: true },
            { personId: 'p-unsched', number: '10', name: 'B', onField: true },
            { personId: 'p-none', number: '  ', name: 'C', onField: true },
          ],
        },
        {
          match_id: 'm-mid',
          roster_members: [{ personId: 'p-1', number: 3, name: 'A', onField: true }],
        },
        {
          match_id: 'm-late-empty',
          roster_members: [{ personId: 'p-1', number: '', name: 'A', onField: true }],
        },
        {
          match_id: 'm-unsched-hi',
          roster_members: [{ personId: 'p-unsched', number: '99', name: 'B', onField: true }],
        },
      ],
    });

    const numbers = await latestFinalizedShirtNumbers(db, {
      organizationId: 'org-1',
      tournamentId: 't-1',
    });

    // m-late-empty has empty string so p-1 falls back to m-mid (3) over m-old (7);
    // p-unsched has m-old (scheduled) ahead of m-unsched-hi (nulls last), so gets '10';
    // p-none has only whitespace -> omitted.
    expect(numbers.get('p-1')).toBe(3);
    expect(numbers.get('p-unsched')).toBe('10');
    expect(numbers.has('p-none')).toBe(false);
  });
});
