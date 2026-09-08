import { deriveTopPerformers, deriveTournamentFacts, resolveChampion } from './tv-statistics.js';
import { publicIntl, tvStatisticsLabels } from './i18n/public-intl.js';
import type { TableProjectionResponse } from '@copalibre/api/src/dto/table-projections.dto.js';
import type { OverviewMatch, StandingsRowView } from './overview.js';
import type { LiveMatch } from './live-state.js';

const labels = tvStatisticsLabels(publicIntl('en'));

describe('tv-statistics', () => {
  describe('label serializability', () => {
    it('carries no function, because these props cross into a hydrated island', () => {
      // The defect this pins: `labels` is passed to `TvDashboard`, a
      // `client:load` island whose props Astro serializes as JSON. A function
      // among them does not survive that, and the island then renders nothing
      // at all — the whole broadcast scorebug gone, with no type error and no
      // console message to say why.
      for (const [name, value] of Object.entries(labels)) {
        expect(`${name}:${typeof value}`).toBe(`${name}:string`);
      }
      expect(() => structuredClone(labels)).not.toThrow();
    });

    it('keeps its placeholders intact so a translated template can still be filled', () => {
      expect(labels.standingsRecord).toContain('{points}');
      expect(labels.standingsRecord).toContain('{played}');
      expect(labels.grandFinalRecord).toContain('{winner}');
      expect(labels.unnamedActor).toContain('{reference}');
    });
  });

  describe('deriveTopPerformers', () => {
    it('derives top performers from a TableProjectionResponse', () => {
      const projection: TableProjectionResponse = {
        layoutCode: 'top-scorers',
        target: 'tournament',
        label: 'Goleadores',
        defaultSort: [],
        projectionVersion: 1,
        columns: [{ code: 'goals', header: 'Goles', format: 'number' }],
        rows: [
          {
            actorId: 'player-1',
            entrantName: 'Lionel Messi',
            rank: 1,
            sharedRank: false,
            cells: {
              goals: { formatted: '12', raw: 12 },
            },
          },
          {
            actorId: 'player-2',
            entrantName: 'Julian Alvarez',
            rank: 2,
            sharedRank: false,
            cells: {
              goals: { formatted: '8', raw: 8 },
            },
          },
        ],
      };

      const clubs = [{ name: 'Lionel Messi', emblemObjectId: 'emblem-inter' }];

      const performers = deriveTopPerformers(labels, 'en', projection, undefined, clubs);
      expect(performers).toHaveLength(2);
      expect(performers[0]?.name).toBe('Lionel Messi');
      expect(performers[0]?.statValue).toBe('12');
      expect(performers[0]?.clubEmblemObjectId).toBe('emblem-inter');
      expect(performers[1]?.name).toBe('Julian Alvarez');
      expect(performers[1]?.statValue).toBe('8');
    });

    it('handles column with empty header or localized header', () => {
      const projection: TableProjectionResponse = {
        layoutCode: 'top-scorers',
        target: 'tournament',
        label: 'Goleadores',
        defaultSort: [],
        projectionVersion: 1,
        columns: [],
        rows: [
          {
            actorId: 'player-xyz',
            rank: 1,
            sharedRank: false,
            cells: {
              stat: { raw: 10, formatted: '' },
            },
          },
        ],
      };
      const performers = deriveTopPerformers(labels, 'en', projection);
      expect(performers).toHaveLength(1);
      expect(performers[0]?.name).toBe('Competitor player');
      expect(performers[0]?.statLabel).toBe('Points');
      expect(performers[0]?.statValue).toBe('10');
    });

    it('falls back to standings when table projection is not available', () => {
      const standings: StandingsRowView[] = [
        { position: 1, name: 'Boca Juniors', abbreviation: 'BOC', played: 5, points: 15 },
        { position: 2, name: 'River Plate', abbreviation: 'RIV', played: 5, points: 12 },
      ];

      const performers = deriveTopPerformers(labels, 'en', undefined, standings);
      expect(performers).toHaveLength(2);
      expect(performers[0]?.name).toBe('Boca Juniors');
      expect(performers[0]?.statValue).toBe(15);
      expect(performers[0]?.rank).toBe(1);
    });

    it('returns empty array when neither projection nor standings exist', () => {
      expect(deriveTopPerformers(labels, 'en', undefined, undefined)).toEqual([]);
    });
  });

  it('ranks by the layout’s own defaultSort, not by its first column', () => {
    const projection: TableProjectionResponse = {
      layoutCode: 'top-scorers',
      target: 'player-ranking',
      label: { en: 'Top scorers', es: 'Goleadores' },
      // The layout opens with its rank column and ranks by goals — reading
      // `columns[0]` reported each player's position where the goals belonged.
      defaultSort: [{ columnCode: 'goals', direction: 'desc' }],
      projectionVersion: 1,
      columns: [
        { code: 'rank', header: { en: 'Rank', es: 'Puesto' }, format: 'number' },
        { code: 'goals', header: { en: 'Goals', es: 'Goles' }, format: 'number' },
      ],
      rows: [
        {
          actorId: 'player-1',
          entrantName: 'Lionel Messi',
          rank: 1,
          sharedRank: false,
          cells: { rank: { formatted: '1', raw: 1 }, goals: { formatted: '12', raw: 12 } },
        },
      ],
    };

    expect(deriveTopPerformers(labels, 'en', projection)[0]?.statValue).toBe('12');
  });

  it('resolves a LocalizedLabel header instead of discarding it', () => {
    const projection: TableProjectionResponse = {
      layoutCode: 'top-scorers',
      target: 'player-ranking',
      label: { en: 'Top scorers' },
      defaultSort: [{ columnCode: 'goals', direction: 'desc' }],
      projectionVersion: 1,
      columns: [{ code: 'goals', header: { en: 'Goals', es: 'Goles' }, format: 'number' }],
      rows: [
        {
          actorId: 'player-1',
          entrantName: 'Lionel Messi',
          rank: 1,
          sharedRank: false,
          cells: { goals: { formatted: '12', raw: 12 } },
        },
      ],
    };

    expect(deriveTopPerformers(labels, 'en', projection)[0]?.statLabel).toBe('Goals');
    expect(deriveTopPerformers(labels, 'es', projection)[0]?.statLabel).toBe('Goles');
  });

  describe('deriveTournamentFacts', () => {
    it('computes total matches, scores, and highest match score with OverviewMatch', () => {
      const matches: OverviewMatch[] = [
        {
          stageNumber: 1,
          matchNumber: 1,
          state: 'final',
          startsAt: '2026-09-01T18:00:00Z',
          home: { name: 'Team A', score: 3 },
          away: { name: 'Team B', score: 1 },
        },
        {
          stageNumber: 1,
          matchNumber: 2,
          state: 'final',
          startsAt: '2026-09-01T20:00:00Z',
          home: { name: 'Team C', score: 5 },
          away: { name: 'Team D', score: 2 },
        },
        {
          stageNumber: 1,
          matchNumber: 3,
          state: 'final',
          startsAt: '2026-09-01T22:00:00Z',
          home: { name: 'Team E', score: 0 },
          away: { name: 'Team F', score: 0 },
        },
        {
          stageNumber: 1,
          matchNumber: 4,
          state: 'final',
          startsAt: '2026-09-01T23:00:00Z',
          home: { name: 'Team G' },
          away: { name: 'Team H' },
        },
      ];

      const facts = deriveTournamentFacts(labels, matches);
      expect(facts).toEqual([
        { label: 'Matches played', value: 4 },
        { label: 'Total scored', value: 11 },
        { label: 'Average per match', value: '2.8' },
        {
          label: 'Highest result',
          value: 7,
          detail: 'Team C 5 - 2 Team D',
        },
      ]);
    });

    it('computes total matches and scores with LiveMatch sides', () => {
      const liveMatches: LiveMatch[] = [
        {
          matchId: 'm1',
          stageNumber: 1,
          matchNumber: 1,
          state: 'final',
          projectionVersion: 1,
          sides: [
            { entrantId: 'e1', name: 'Team X', score: 4, state: 'final' },
            { entrantId: 'e2', name: 'Team Y', score: 2, state: 'final' },
          ],
        },
        {
          matchId: 'm2',
          stageNumber: 1,
          matchNumber: 2,
          state: 'final',
          projectionVersion: 1,
          sides: [
            { entrantId: 'e3', name: 'Team Z', score: 0, state: 'final' },
            { entrantId: 'e4', name: 'Team W', score: 1, state: 'final' },
          ],
        },
      ];

      const facts = deriveTournamentFacts(labels, liveMatches);
      expect(facts[0]?.value).toBe(2);
      expect(facts[1]?.value).toBe(7);
      expect(facts[3]?.value).toBe(6);
      expect(facts[3]?.detail).toBe('Team X 4 - 2 Team Y');
    });

    it('returns development message if no final matches exist', () => {
      const matches: OverviewMatch[] = [
        {
          stageNumber: 1,
          matchNumber: 1,
          state: 'upcoming',
          startsAt: '2026-09-01T18:00:00Z',
          home: { name: 'Team A' },
          away: { name: 'Team B' },
        },
      ];

      const facts = deriveTournamentFacts(labels, matches);
      expect(facts).toEqual([
        { label: 'Scheduled matches', value: 1 },
        { label: 'Status', value: 'In progress' },
      ]);
    });
  });

  describe('resolveChampion', () => {
    it('resolves champion from standings when all matches are final', () => {
      const matches: OverviewMatch[] = [
        {
          stageNumber: 1,
          matchNumber: 1,
          state: 'final',
          startsAt: '',
          home: { name: 'Huracán', score: 2 },
          away: { name: 'Godoy Cruz', score: 1 },
        },
      ];
      const standings: StandingsRowView[] = [
        { position: 1, name: 'Huracán', abbreviation: 'HUR', played: 3, points: 9 },
        { position: 2, name: 'Godoy Cruz', abbreviation: 'GOD', played: 3, points: 6 },
      ];
      const clubs = [{ name: 'Huracán', emblemObjectId: 'emblem-huracan' }];

      const champion = resolveChampion(labels, matches, standings, clubs);
      expect(champion).toBeDefined();
      expect(champion?.name).toBe('Huracán');
      expect(champion?.title).toBe('Tournament champion');
      expect(champion?.emblemObjectId).toBe('emblem-huracan');
    });

    it('resolves champion from final knockout match with sides when standings are absent', () => {
      const matches: LiveMatch[] = [
        {
          matchId: 'final-match',
          stageNumber: 2,
          matchNumber: 2,
          state: 'final',
          projectionVersion: 2,
          sides: [
            { entrantId: 'e1', name: 'Real Madrid', score: 3, state: 'final', abbreviation: 'RMA' },
            { entrantId: 'e2', name: 'Barcelona', score: 1, state: 'final', abbreviation: 'BAR' },
          ],
        },
        {
          matchId: 'third-place-match',
          stageNumber: 2,
          matchNumber: 1,
          state: 'final',
          projectionVersion: 2,
          sides: [
            { entrantId: 'e3', name: 'Atletico', score: 1, state: 'final' },
            { entrantId: 'e4', name: 'Sevilla', score: 0, state: 'final' },
          ],
        },
        {
          matchId: 'semi-match',
          stageNumber: 1,
          matchNumber: 1,
          state: 'final',
          projectionVersion: 2,
          sides: [
            { entrantId: 'e1', name: 'Real Madrid', score: 2, state: 'final' },
            { entrantId: 'e3', name: 'Atletico', score: 0, state: 'final' },
          ],
        },
      ];

      const clubs = [{ name: 'Real Madrid', emblemObjectId: 'rma-emblem' }];
      const champion = resolveChampion(labels, matches, undefined, clubs);
      expect(champion).toBeDefined();
      expect(champion?.name).toBe('Real Madrid');
      expect(champion?.abbreviation).toBe('RMA');
      expect(champion?.emblemObjectId).toBe('rma-emblem');
      expect(champion?.record).toContain('Grand final winner (3 – 1)');
    });

    it('resolves champion from final match with home/away when away team wins', () => {
      const matches: OverviewMatch[] = [
        {
          stageNumber: 2,
          matchNumber: 1,
          state: 'final',
          startsAt: '',
          home: { name: 'Chelsea', score: 1, abbreviation: 'CHE' },
          away: { name: 'Arsenal', score: 2, abbreviation: 'ARS' },
        },
      ];

      const clubs = [{ name: 'Arsenal', emblemObjectId: 'ars-emblem' }];
      const champion = resolveChampion(labels, matches, undefined, clubs);
      expect(champion).toBeDefined();
      expect(champion?.name).toBe('Arsenal');
      expect(champion?.abbreviation).toBe('ARS');
      expect(champion?.emblemObjectId).toBe('ars-emblem');
      expect(champion?.record).toContain('Grand final winner (2 – 1)');
    });

    it('resolves leader if tournament is not finished yet', () => {
      const matches: OverviewMatch[] = [
        {
          stageNumber: 1,
          matchNumber: 1,
          state: 'upcoming',
          startsAt: '',
          home: { name: 'Huracán', score: 0 },
          away: { name: 'Godoy Cruz', score: 0 },
        },
      ];
      const standings: StandingsRowView[] = [
        { position: 1, name: 'Huracán', abbreviation: 'HUR', played: 1, points: 3 },
      ];

      const leader = resolveChampion(labels, matches, standings);
      expect(leader?.title).toBe('Table leader');
      expect(leader?.name).toBe('Huracán');
    });

    it('returns undefined if no matches or standings exist or no winner resolved', () => {
      expect(resolveChampion(labels, [], [])).toBeUndefined();
      expect(
        resolveChampion(
          labels,
          [
            {
              stageNumber: 1,
              matchNumber: 1,
              state: 'final',
              startsAt: '',
              home: { name: 'Team A', score: 1 },
              away: { name: 'Team B', score: 1 },
            },
          ],
          undefined,
        ),
      ).toBeUndefined();
    });

    it('falls back to standings[0] if no position 1 exists', () => {
      const standings: StandingsRowView[] = [
        { position: 2, name: 'Team Two', abbreviation: 'TT', played: 1, points: 3 },
      ];
      const res = resolveChampion(labels, [], standings);
      expect(res?.name).toBe('Team Two');
    });

    it('handles LiveMatch with partial or empty sides in resolveChampion', () => {
      const matches: LiveMatch[] = [
        {
          matchId: 'm-empty',
          stageNumber: 1,
          matchNumber: 2,
          state: 'final',
          projectionVersion: 1,
          sides: [],
        },
        {
          matchId: 'm-stage-diff',
          stageNumber: 2,
          matchNumber: 1,
          state: 'final',
          projectionVersion: 1,
          sides: [{ entrantId: 'e1', name: 'Winner', score: 2, state: 'final' }],
        },
      ];
      const champion = resolveChampion(labels, matches);
      expect(champion?.name).toBe('Winner');
    });
  });
});
