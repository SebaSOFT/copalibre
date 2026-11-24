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
    tournamentId: 't-1',
    organizationId: 'org-1',
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
          code: 'team-only-goals',
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
      personId: 'p-1',
      organizationId: 'org-1',
      displayName: 'Francisco V Arriaga',
      hiddenFromPublic: false,
    });
    vi.spyOn(PersonRepository.prototype, 'competitionHistory').mockResolvedValue([
      {
        tournamentId: 't-1',
        tournamentName: 'Panamericano 2025',
        tournamentAlias: 'panamericano-2025',
        disciplineRef: { descriptorId: 'desc-rh', version: '1.1.0' },
        teamId: 'team-1',
        teamName: 'Casa de Italia',
        clubAlias: 'casa-de-italia',
        role: 'player',
        entrantId: 'en-1',
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
    vi.spyOn(tableRead, 'latestFinalizedShirtNumbers').mockResolvedValue(new Map([['p-1', 14]]));

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
      'p-1',
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
          actorId: 'p-hidden',
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
          actorId: 'p-visible',
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
                  { person_id: 'p-hidden', hidden_from_public: true },
                  { person_id: 'p-visible', hidden_from_public: false },
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

    const hiddenRow = response.rows.find((r) => r.actorId === 'p-hidden');
    const visibleRow = response.rows.find((r) => r.actorId === 'p-visible');
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
          actorId: 'p-1',
          actorName: 'Aliased Player',
          clubId: 'c-1',
          clubAlias: 'casa-de-italia',
          rank: 1,
          sharedRank: false,
          cells: { player: { raw: 'Aliased Player', formatted: 'Aliased Player' } },
        },
        {
          actorId: 'p-2',
          actorName: 'Unaliased Player',
          clubId: 'c-2',
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
                  { person_id: 'p-1', hidden_from_public: false },
                  { person_id: 'p-2', hidden_from_public: false },
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
      'c-2',
    );
    expect(tableRead.readTableProjection).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ clubAlias: 'casa-de-italia', clubId: 'c-2' }),
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
        matchId: 'm-1',
        stageNumber: 1,
        matchNumber: 1,
        round: 1,
        status: 'upcoming',
        homeEntrantId: 'en-1',
        homeName: 'Casa de Italia',
        homeClubId: 'c-1',
        homeClubAlias: 'casa-de-italia',
        awayEntrantId: 'en-2',
        awayName: 'Sin Alias',
        awayClubId: 'c-2',
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
      { stageId: 'st-1', number: 1, name: 'Grupos', format: 'round-robin' } as never,
    ]);
    vi.spyOn(StageReadModel.prototype, 'matches').mockResolvedValue([
      {
        matchId: 'm-1',
        fixtureId: 'f-1',
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
          'en-1',
          {
            name: 'Casa de Italia',
            abbreviation: 'CIT',
            clubId: 'c-1',
            clubAlias: 'casa-de-italia',
          },
        ],
        ['en-2', { name: 'Sin Alias', abbreviation: 'SNA', clubId: 'c-2' }],
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
                match_id: 'm-1',
                number: 1,
                status: 'scheduled',
                result: null,
                fixture_id: 'f-1',
                round: 1,
                home_entrant_id: 'en-1',
                away_entrant_id: 'en-2',
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

  it('picks the first in-progress published tournament by start date ascending for organization clubs', async () => {
    vi.spyOn(EnrollmentRepository.prototype, 'listClubs').mockResolvedValue([
      { clubId: 'c-early', organizationId: 'org-1', name: 'Club Early', alias: 'club-early' },
      { clubId: 'c-late', organizationId: 'org-1', name: 'Club Late', alias: 'club-late' },
      { clubId: 'c-idle', organizationId: 'org-1', name: 'Club Idle', alias: 'club-idle' },
    ]);
    vi.spyOn(TournamentRepository.prototype, 'listPublishedByOrganization').mockResolvedValue([
      {
        ...tournament,
        tournamentId: 't-finished',
        alias: 'copa-terminada',
        name: 'Copa Terminada',
        status: 'finished',
        startedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        ...tournament,
        tournamentId: 't-upcoming',
        alias: 'copa-proxima',
        name: 'Copa Próxima',
        status: 'published',
      },
      {
        ...tournament,
        tournamentId: 't-late',
        alias: 'copa-tardia',
        name: 'Copa Tardía',
        status: 'started',
        startedAt: '2026-11-20T00:00:00.000Z',
      },
      {
        ...tournament,
        tournamentId: 't-early',
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
                  { tournament_id: 't-late', club_id: 'c-early' },
                  { tournament_id: 't-late', club_id: 'c-late' },
                  { tournament_id: 't-early', club_id: 'c-early' },
                ];
              }
              return [];
            }
            return [];
          },
          executeTakeFirst: async () =>
            table === 'organizations'
              ? {
                  organizationId: 'org-1',
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
    expect(byId.get('c-early')?.tournamentAlias).toBe('copa-temprana');
    expect(byId.get('c-late')?.tournamentAlias).toBe('copa-tardia');
    expect(byId.get('c-idle')).not.toHaveProperty('tournamentAlias');
  });
});
