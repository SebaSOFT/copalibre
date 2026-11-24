import { afterEach, describe, expect, it, vi } from 'vitest';
import { footballDescriptor, type DisciplineDescriptor } from '@copalibre/domain';
import { PersonRepository, TournamentRepository, type Database } from '@copalibre/persistence';
import type { FastifyReply } from 'fastify';
import type { Kysely } from 'kysely';
import { PublicProjectionsController } from './public-projections.controller.js';
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
});
