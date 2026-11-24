import { afterEach, describe, expect, it, vi } from 'vitest';
import { footballDescriptor, type DisciplineDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  PersonRepository,
  PublicOverviewReadModel,
  StageReadModel,
  TournamentRepository,
  type Database,
} from '@copalibre/persistence';
import type { FastifyReply } from 'fastify';
import type { Kysely } from 'kysely';
import {
  firstQueryString,
  normalizeClubAliasQuery,
  PublicProjectionsController,
  PublicTournamentListingController,
} from './public-projections.controller.js';
import * as fixtureSourcesRead from './fixture-sources.js';
import * as matchesViewRead from '../matches-view/read.js';
import * as scheduleRead from '../matches-view/schedule.js';
import * as tableRead from '../table-projections/read.js';

describe('PublicProjectionsController player profile & visibility unit tests', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const tournament = {
    tournamentId: '01936f4a-002c-7000-8000-0000000002ec',
    organizationId: '01936f4a-0020-7000-8000-000000000220',
    alias: 'panamericano-2025',
    name: 'Panamericano 2025',
    status: 'published' as const,
    disciplineRef: { descriptorId: 'desc-rh', version: '1.1.0' },
    includesMinors: false,
    showYouthProfiles: false,
    featured: false,
  };

  it('merges zero-valued declared person collectors in declaration order and populates shirtNumber & clubAlias', async () => {
    const base = footballDescriptor();
    const descriptor: DisciplineDescriptor = {
      ...base,
      descriptorId: 'desc-rh',
      version: '1.1.0',
      name: { en: 'Rink Hockey', es: 'Hockey sobre patines' },
      collectors: [
        {
          code: 'player-goals',
          label: { en: 'Goals', es: 'Goles' },
          source: { kind: 'event', definitionCodes: ['goal'], actorSource: 'primary' },
          measure: { kind: 'count' },
          granularity: { actor: 'person', competition: 'match' },
        },
        {
          code: 'player-appearances',
          label: { en: 'Appearances', es: 'Partidos jugados' },
          source: { kind: 'participation' },
          measure: { kind: 'count' },
          granularity: { actor: 'person', competition: 'match' },
        },
        {
          code: '01936f4a-0032-7000-8000-000000000352',
          label: { en: 'Team goals' },
          source: { kind: 'statistic', statisticCode: 'goals-for' },
          measure: { kind: 'sum', field: 'goals-for' },
          granularity: { actor: 'team', competition: 'match' },
        },
        {
          code: 'stage-capped-assists',
          label: { en: 'Stage assists' },
          source: { kind: 'event', definitionCodes: ['goal'], actorSource: 'primary' },
          measure: { kind: 'count' },
          granularity: { actor: 'person', competition: 'match' },
          rollsUpTo: { competition: 'stage' },
        },
      ],
    };

    vi.spyOn(TournamentRepository.prototype, 'findByScopedAlias').mockResolvedValue(
      tournament as never,
    );
    vi.spyOn(PersonRepository.prototype, 'findPerson').mockResolvedValue({
      personId: '01936f4a-0021-7000-8000-000000000231',
      organizationId: '01936f4a-0020-7000-8000-000000000220',
      displayName: 'Francisco V Arriaga',
      hiddenFromPublic: false,
    });
    vi.spyOn(PersonRepository.prototype, 'competitionHistory').mockResolvedValue([
      {
        tournamentId: '01936f4a-002c-7000-8000-0000000002ec',
        tournamentName: 'Panamericano 2025',
        tournamentAlias: 'panamericano-2025',
        disciplineRef: { descriptorId: 'desc-rh', version: '1.1.0' },
        teamId: '01936f4a-0031-7000-8000-000000000341',
        teamName: 'Casa de Italia',
        clubAlias: 'casa-de-italia',
        role: 'player',
        entrantId: '01936f4a-000a-7000-8000-0000000000aa',
        entrantName: 'Casa de Italia',
        entrantAbbreviation: 'CIT',
        createdAt: new Date('2026-11-01T00:00:00Z'),
      },
    ]);
    vi.spyOn(PersonRepository.prototype, 'careerTotals').mockResolvedValue([
      {
        descriptorId: 'desc-rh',
        disciplineName: 'Rink Hockey',
        totals: [{ collectorCode: 'player-appearances', value: 4, samples: 4 }],
      },
    ]);
    vi.spyOn(tableRead, 'latestFinalizedShirtNumbers').mockResolvedValue(
      new Map([['01936f4a-0021-7000-8000-000000000231', 14]]),
    );

    const db = {
      selectFrom: (table: string) => {
        const chain = {
          select: () => chain,
          where: () => chain,
          execute: async () =>
            table === 'discipline_descriptors'
              ? [{ descriptorId: 'desc-rh', version: '1.1.0', document: descriptor }]
              : [],
          executeTakeFirst: async () =>
            table === 'organizations'
              ? { name: 'Panamericano', timezone: 'America/Argentina/Buenos_Aires' }
              : undefined,
        };
        return chain;
      },
    } as unknown as Kysely<Database>;

    const controller = new PublicProjectionsController(db);
    const reply = { header: vi.fn() } as unknown as FastifyReply;

    const response = await controller.playerProfile(
      'panamericano',
      'panamericano-2025',
      '01936f4a-0021-7000-8000-000000000231',
      reply,
    );

    expect(response.competitionHistory[0]).toMatchObject({
      clubAlias: 'casa-de-italia',
      shirtNumber: 14,
    });
    expect(response.careerStatistics).toHaveLength(1);
    expect(response.careerStatistics[0]?.statistics).toEqual([
      {
        code: 'player-goals',
        label: 'Goals',
        localizedLabel: { en: 'Goals', es: 'Goles' },
        value: 0,
        samples: 0,
      },
      {
        code: 'player-appearances',
        label: 'Appearances',
        localizedLabel: { en: 'Appearances', es: 'Partidos jugados' },
        value: 4,
        samples: 4,
      },
    ]);
  });

  it('strips shirtNumber on person-granularity table rows when hiddenAtRequest is true', async () => {
    vi.spyOn(TournamentRepository.prototype, 'findByScopedAlias').mockResolvedValue(
      tournament as never,
    );
    vi.spyOn(tableRead, 'readTableProjection').mockResolvedValue({
      layout: {
        code: 'top-scorers',
        target: 'player-ranking',
        label: { en: 'Top Scorers' },
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
            source: { kind: 'collector', code: 'player-goals' },
            format: 'number',
          },
        ],
      },
      rows: [
        {
          actorId: '01936f4a-0025-7000-8000-000000000275',
          actorName: 'Hidden Player',
          shirtNumber: 9,
          rank: 1,
          sharedRank: false,
          cells: {
            player: { raw: 'Hidden Player', formatted: 'Hidden Player' },
            goals: { raw: 5, formatted: '5' },
          },
        },
        {
          actorId: '01936f4a-0029-7000-8000-0000000002b9',
          actorName: 'Visible Player',
          shirtNumber: 3,
          rank: 2,
          sharedRank: false,
          cells: {
            player: { raw: 'Visible Player', formatted: 'Visible Player' },
            goals: { raw: 2, formatted: '2' },
          },
        },
      ],
      projectionVersion: 1,
      columnDescriptions: {},
    });

    const db = {
      selectFrom: (table: string) => {
        const chain = {
          select: () => chain,
          where: () => chain,
          execute: async () =>
            table === 'persons'
              ? [
                  { person_id: '01936f4a-0025-7000-8000-000000000275', hidden_from_public: true },
                  { person_id: '01936f4a-0029-7000-8000-0000000002b9', hidden_from_public: false },
                ]
              : [],
          executeTakeFirst: async () =>
            table === 'organizations'
              ? { name: 'Panamericano', timezone: 'America/Argentina/Buenos_Aires' }
              : undefined,
        };
        return chain;
      },
    } as unknown as Kysely<Database>;

    const controller = new PublicProjectionsController(db);
    const response = await controller.tournamentTable(
      'panamericano',
      'panamericano-2025',
      'top-scorers',
    );

    const hiddenRow = response.rows.find(
      (r) => r.actorId === '01936f4a-0025-7000-8000-000000000275',
    );
    const visibleRow = response.rows.find(
      (r) => r.actorId === '01936f4a-0029-7000-8000-0000000002b9',
    );
    expect(hiddenRow?.hiddenAtRequest).toBe(true);
    expect(hiddenRow?.actorName).toBe('');
    expect(hiddenRow?.shirtNumber).toBeUndefined();
    expect(visibleRow?.shirtNumber).toBe(3);
  });

  it('passes clubAlias on table rows and strips it when publicProfileAvailable is false', async () => {
    vi.spyOn(TournamentRepository.prototype, 'findByScopedAlias').mockResolvedValue(
      tournament as never,
    );
    vi.spyOn(tableRead, 'readTableProjection').mockResolvedValue({
      layout: {
        code: 'top-scorers',
        target: 'player-ranking',
        label: { en: 'Top Scorers' },
        entityGranularity: 'person',
        defaultSort: [{ columnCode: 'goals', direction: 'desc' }],
        columns: [
          {
            code: 'player',
            header: { en: 'Player' },
            source: { kind: 'actor-name' },
            format: 'text',
          },
        ],
      },
      rows: [
        {
          actorId: '01936f4a-0021-7000-8000-000000000231',
          actorName: 'Aliased Player',
          clubId: '01936f4a-0001-7000-8000-000000000011',
          clubAlias: 'casa-de-italia',
          rank: 1,
          sharedRank: false,
          cells: { player: { raw: 'Aliased Player', formatted: 'Aliased Player' } },
        },
        {
          actorId: '01936f4a-0023-7000-8000-000000000253',
          actorName: 'Unaliased Player',
          clubId: '01936f4a-0002-7000-8000-000000000022',
          rank: 2,
          sharedRank: false,
          cells: { player: { raw: 'Unaliased Player', formatted: 'Unaliased Player' } },
        },
      ],
      projectionVersion: 1,
      columnDescriptions: {},
    });

    const db = {
      selectFrom: (table: string) => {
        const chain = {
          select: () => chain,
          where: () => chain,
          execute: async () =>
            table === 'persons'
              ? [
                  { person_id: '01936f4a-0021-7000-8000-000000000231', hidden_from_public: false },
                  { person_id: '01936f4a-0023-7000-8000-000000000253', hidden_from_public: false },
                ]
              : [],
          executeTakeFirst: async () =>
            table === 'organizations'
              ? { name: 'Panamericano', timezone: 'America/Argentina/Buenos_Aires' }
              : undefined,
        };
        return chain;
      },
    } as unknown as Kysely<Database>;

    const controller = new PublicProjectionsController(db);
    const response = await controller.tournamentTable(
      'panamericano',
      'panamericano-2025',
      'top-scorers',
      'casa-de-italia',
      '01936f4a-0002-7000-8000-000000000022',
    );
    expect(tableRead.readTableProjection).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        clubAlias: 'casa-de-italia',
        clubId: '01936f4a-0002-7000-8000-000000000022',
      }),
      'top-scorers',
    );
    expect(response.rows[0]?.clubAlias).toBe('casa-de-italia');
    expect(response.rows[1]).not.toHaveProperty('clubAlias');
  });

  it('fills homeClubAlias and awayClubAlias on matchesView and omits them when absent', async () => {
    vi.spyOn(TournamentRepository.prototype, 'findByScopedAlias').mockResolvedValue(
      tournament as never,
    );
    vi.spyOn(matchesViewRead, 'readMatchesView').mockResolvedValue([
      {
        matchId: '01936f4a-0016-7000-8000-000000000176',
        stageNumber: 1,
        matchNumber: 1,
        round: 1,
        status: 'upcoming',
        homeEntrantId: '01936f4a-000a-7000-8000-0000000000aa',
        homeName: 'Casa de Italia',
        homeClubId: '01936f4a-0001-7000-8000-000000000011',
        homeClubAlias: 'casa-de-italia',
        awayEntrantId: '01936f4a-000b-7000-8000-0000000000bb',
        awayName: 'Sin Alias',
        awayClubId: '01936f4a-0002-7000-8000-000000000022',
      },
    ]);

    const db = {
      selectFrom: (table: string) => {
        const chain = {
          select: () => chain,
          where: () => chain,
          execute: async () => [],
          executeTakeFirst: async () =>
            table === 'organizations'
              ? { name: 'Panamericano', timezone: 'America/Argentina/Buenos_Aires' }
              : undefined,
        };
        return chain;
      },
    } as unknown as Kysely<Database>;

    const controller = new PublicProjectionsController(db);
    const response = await controller.matchesView(
      'panamericano',
      'panamericano-2025',
      undefined,
      undefined,
      undefined,
    );
    expect(response.matches[0]?.homeClubAlias).toBe('casa-de-italia');
    expect(response.matches[0]).not.toHaveProperty('awayClubAlias');
  });

  it('fills homeClubAlias and awayClubAlias on matchReport when clubs have aliases and omits them otherwise', async () => {
    vi.spyOn(TournamentRepository.prototype, 'findByScopedAlias').mockResolvedValue(
      tournament as never,
    );
    vi.spyOn(CompetitionRepository.prototype, 'listStagesOfTournament').mockResolvedValue([
      {
        stageId: '01936f4a-002a-7000-8000-0000000002ca',
        number: 1,
        name: 'Grupos',
        format: 'round-robin',
      } as never,
    ]);
    vi.spyOn(StageReadModel.prototype, 'matches').mockResolvedValue([
      {
        matchId: '01936f4a-0016-7000-8000-000000000176',
        fixtureId: '01936f4a-0012-7000-8000-000000000132',
        round: 1,
        position: 1,
        status: 'scheduled',
        games: [],
      } as never,
    ]);
    vi.spyOn(fixtureSourcesRead, 'readFixtureSources').mockResolvedValue(new Map());
    vi.spyOn(CompetitionRepository.prototype, 'listSegments').mockResolvedValue([]);
    vi.spyOn(CompetitionRepository.prototype, 'listEvents').mockResolvedValue([]);
    vi.spyOn(TournamentRepository.prototype, 'findDescriptor').mockResolvedValue(
      footballDescriptor(),
    );
    vi.spyOn(EnrollmentRepository.prototype, 'resolveEntrantPodiumDetails').mockResolvedValue(
      new Map([
        [
          '01936f4a-000a-7000-8000-0000000000aa',
          {
            name: 'Casa de Italia',
            abbreviation: 'CIT',
            clubId: '01936f4a-0001-7000-8000-000000000011',
            clubAlias: 'casa-de-italia',
          },
        ],
        [
          '01936f4a-000b-7000-8000-0000000000bb',
          {
            name: 'Sin Alias',
            abbreviation: 'SNA',
            clubId: '01936f4a-0002-7000-8000-000000000022',
          },
        ],
      ]),
    );
    vi.spyOn(scheduleRead, 'readPublicScheduleChanges').mockResolvedValue(new Map());

    const db = {
      selectFrom: (table: string) => {
        const chain = {
          innerJoin: () => chain,
          leftJoin: () => chain,
          select: () => chain,
          where: () => chain,
          orderBy: () => chain,
          execute: async () => [],
          executeTakeFirst: async () => {
            if (table === 'organizations') {
              return { name: 'Panamericano', timezone: 'America/Argentina/Buenos_Aires' };
            }
            if (table === 'matches') {
              return {
                match_id: '01936f4a-0016-7000-8000-000000000176',
                number: 1,
                status: 'scheduled',
                result: null,
                fixture_id: '01936f4a-0012-7000-8000-000000000132',
                round: 1,
                home_entrant_id: '01936f4a-000a-7000-8000-0000000000aa',
                away_entrant_id: '01936f4a-000b-7000-8000-0000000000bb',
              };
            }
            return undefined;
          },
        };
        return chain;
      },
    } as unknown as Kysely<Database>;

    const controller = new PublicProjectionsController(db);
    const report = await controller.matchReport('panamericano', 'panamericano-2025', '1', '1');
    expect(report.homeClubAlias).toBe('casa-de-italia');
    expect(report).not.toHaveProperty('awayClubAlias');
  });

  it('derives an organization club tournament alias from team entrants only, never from person entrants', async () => {
    vi.spyOn(EnrollmentRepository.prototype, 'listClubs').mockResolvedValue([
      {
        clubId: '01936f4a-0001-7000-8000-000000000011',
        organizationId: '01936f4a-0020-7000-8000-000000000220',
        name: 'Club Uno',
        alias: 'club-uno',
      },
    ]);
    vi.spyOn(TournamentRepository.prototype, 'listPublishedByOrganization').mockResolvedValue([
      {
        ...tournament,
        tournamentId: '01936f4a-002c-7000-8000-0000000002ec',
        alias: 'copa-uno',
        name: 'Copa Uno',
        status: 'started',
        startedAt: '2026-11-10T00:00:00.000Z',
      },
    ]);
    vi.spyOn(CompetitionRepository.prototype, 'listStagesOfTournament').mockResolvedValue([]);
    vi.spyOn(PublicOverviewReadModel.prototype, 'matchesForTournament').mockResolvedValue([]);
    vi.spyOn(scheduleRead, 'readPublicVenues').mockResolvedValue([]);

    const joinedTables: string[] = [];
    const db = {
      selectFrom: (table: string) => {
        const chain = {
          innerJoin: (joined: string) => {
            if (table === 'entrants') joinedTables.push(joined);
            return chain;
          },
          select: () => chain,
          where: () => chain,
          execute: async () => {
            if (table === 'discipline_descriptors') {
              return [{ descriptorId: 'desc-rh', document: footballDescriptor() }];
            }
            if (table === 'entrants') {
              // Only a person entrant of the club: its tournament must not link the club.
              return [];
            }
            return [];
          },
          executeTakeFirst: async () =>
            table === 'organizations'
              ? {
                  organizationId: '01936f4a-0020-7000-8000-000000000220',
                  name: 'Panamericano',
                  alias: 'panamericano',
                  emblem_object_id: null,
                }
              : undefined,
        };
        return chain;
      },
    } as unknown as Kysely<Database>;

    const listing = await new PublicTournamentListingController(db).listTournaments('panamericano');

    expect(joinedTables).toEqual(['teams']);
    expect(
      listing.clubs.find((club) => club.clubId === '01936f4a-0001-7000-8000-000000000011'),
    ).not.toHaveProperty('tournamentAlias');
  });

  it('picks the first in-progress published tournament by start date ascending for organization clubs', async () => {
    vi.spyOn(EnrollmentRepository.prototype, 'listClubs').mockResolvedValue([
      {
        clubId: '01936f4a-0003-7000-8000-000000000033',
        organizationId: '01936f4a-0020-7000-8000-000000000220',
        name: 'Club Early',
        alias: 'club-early',
      },
      {
        clubId: '01936f4a-0005-7000-8000-000000000055',
        organizationId: '01936f4a-0020-7000-8000-000000000220',
        name: 'Club Late',
        alias: 'club-late',
      },
      {
        clubId: '01936f4a-0004-7000-8000-000000000044',
        organizationId: '01936f4a-0020-7000-8000-000000000220',
        name: 'Club Idle',
        alias: 'club-idle',
      },
    ]);
    vi.spyOn(TournamentRepository.prototype, 'listPublishedByOrganization').mockResolvedValue([
      {
        ...tournament,
        tournamentId: '01936f4a-002e-7000-8000-00000000030e',
        alias: 'copa-terminada',
        name: 'Copa Terminada',
        status: 'finished',
        startedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        ...tournament,
        tournamentId: '01936f4a-0030-7000-8000-000000000330',
        alias: 'copa-proxima',
        name: 'Copa Próxima',
        status: 'published',
      },
      {
        ...tournament,
        tournamentId: '01936f4a-002f-7000-8000-00000000031f',
        alias: 'copa-tardia',
        name: 'Copa Tardía',
        status: 'started',
        startedAt: '2026-11-20T00:00:00.000Z',
      },
      {
        ...tournament,
        tournamentId: '01936f4a-002d-7000-8000-0000000002fd',
        alias: 'copa-temprana',
        name: 'Copa Temprana',
        status: 'started',
        startedAt: '2026-11-10T00:00:00.000Z',
      },
    ]);
    vi.spyOn(CompetitionRepository.prototype, 'listStagesOfTournament').mockResolvedValue([]);
    vi.spyOn(PublicOverviewReadModel.prototype, 'matchesForTournament').mockResolvedValue([]);
    vi.spyOn(scheduleRead, 'readPublicVenues').mockResolvedValue([]);

    let entrantCall = 0;
    const db = {
      selectFrom: (table: string) => {
        const chain = {
          innerJoin: () => chain,
          select: () => chain,
          where: () => chain,
          execute: async () => {
            if (table === 'discipline_descriptors') {
              return [{ descriptorId: 'desc-rh', document: footballDescriptor() }];
            }
            if (table === 'entrants') {
              entrantCall += 1;
              if (entrantCall === 1) {
                return [
                  {
                    tournament_id: '01936f4a-002f-7000-8000-00000000031f',
                    club_id: '01936f4a-0003-7000-8000-000000000033',
                  },
                  {
                    tournament_id: '01936f4a-002f-7000-8000-00000000031f',
                    club_id: '01936f4a-0005-7000-8000-000000000055',
                  },
                  {
                    tournament_id: '01936f4a-002d-7000-8000-0000000002fd',
                    club_id: '01936f4a-0003-7000-8000-000000000033',
                  },
                ];
              }
              return [];
            }
            return [];
          },
          executeTakeFirst: async () =>
            table === 'organizations'
              ? {
                  organizationId: '01936f4a-0020-7000-8000-000000000220',
                  name: 'Panamericano',
                  alias: 'panamericano',
                  emblem_object_id: null,
                }
              : undefined,
        };
        return chain;
      },
    } as unknown as Kysely<Database>;

    const listingController = new PublicTournamentListingController(db);
    const listing = await listingController.listTournaments('panamericano');

    const byId = new Map(listing.clubs.map((club) => [club.clubId, club]));
    expect(byId.get('01936f4a-0003-7000-8000-000000000033')?.tournamentAlias).toBe('copa-temprana');
    expect(byId.get('01936f4a-0005-7000-8000-000000000055')?.tournamentAlias).toBe('copa-tardia');
    expect(byId.get('01936f4a-0004-7000-8000-000000000044')).not.toHaveProperty('tournamentAlias');
  });
});

describe('club query normalization', () => {
  it('reads a single club alias, trimmed, and treats blank or absent values as no filter', () => {
    expect(normalizeClubAliasQuery(' andes-talleres ')).toBe('andes-talleres');
    expect(normalizeClubAliasQuery('')).toBeUndefined();
    expect(normalizeClubAliasQuery('   ')).toBeUndefined();
    expect(normalizeClubAliasQuery(undefined)).toBeUndefined();
  });

  it('takes the first string of a repeated club parameter instead of failing on the array', () => {
    expect(normalizeClubAliasQuery(['andes-talleres', 'casa-de-italia'])).toBe('andes-talleres');
    expect(normalizeClubAliasQuery(['', 'casa-de-italia'])).toBe('casa-de-italia');
    expect(normalizeClubAliasQuery([])).toBeUndefined();
    expect(normalizeClubAliasQuery([42, null])).toBeUndefined();
  });

  it('ignores a value that is neither a string nor a list of strings', () => {
    expect(normalizeClubAliasQuery(42)).toBeUndefined();
    expect(normalizeClubAliasQuery({ club: 'andes-talleres' })).toBeUndefined();
  });

  it('firstQueryString returns the first string of a list and nothing for other values', () => {
    expect(firstQueryString('01936f4a-0a00-7000-8000-000000000001')).toBe(
      '01936f4a-0a00-7000-8000-000000000001',
    );
    expect(firstQueryString(['01936f4a-0a00-7000-8000-000000000001', 'x'])).toBe(
      '01936f4a-0a00-7000-8000-000000000001',
    );
    expect(firstQueryString(['', 'x'])).toBe('');
    expect(firstQueryString(undefined)).toBeUndefined();
    expect(firstQueryString(7)).toBeUndefined();
  });
});
