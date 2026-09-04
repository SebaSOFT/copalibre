import { deriveTopPerformers, deriveTournamentFacts, resolveChampion } from './tv-statistics.js';
import type { TableProjectionResponse } from '@copalibre/api/src/dto/table-projections.dto.js';
import type { OverviewMatch, StandingsRowView } from './overview.js';
import type { LiveMatch } from './live-state.js';

describe('tv-statistics', () => {
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

      const performers = deriveTopPerformers(projection, undefined, clubs);
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
      const performers = deriveTopPerformers(projection);
      expect(performers).toHaveLength(1);
      expect(performers[0]?.name).toBe('Jugador player');
      expect(performers[0]?.statLabel).toBe('Puntos');
      expect(performers[0]?.statValue).toBe('10');
    });

    it('falls back to standings when table projection is not available', () => {
      const standings: StandingsRowView[] = [
        { position: 1, name: 'Boca Juniors', abbreviation: 'BOC', played: 5, points: 15 },
        { position: 2, name: 'River Plate', abbreviation: 'RIV', played: 5, points: 12 },
      ];

      const performers = deriveTopPerformers(undefined, standings);
      expect(performers).toHaveLength(2);
      expect(performers[0]?.name).toBe('Boca Juniors');
      expect(performers[0]?.statValue).toBe(15);
      expect(performers[0]?.rank).toBe(1);
    });

    it('returns empty array when neither projection nor standings exist', () => {
      expect(deriveTopPerformers(undefined, undefined)).toEqual([]);
    });
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

      const facts = deriveTournamentFacts(matches);
      expect(facts).toEqual([
        { label: 'Partidos disputados', value: 4 },
        { label: 'Total anotaciones', value: 11 },
        { label: 'Promedio por partido', value: '2.8' },
        {
          label: 'Mayor resultado',
          value: '7 goles',
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

      const facts = deriveTournamentFacts(liveMatches);
      expect(facts[0]?.value).toBe(2);
      expect(facts[1]?.value).toBe(7);
      expect(facts[3]?.value).toBe('6 goles');
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

      const facts = deriveTournamentFacts(matches);
      expect(facts).toEqual([
        { label: 'Partidos en agenda', value: 1 },
        { label: 'Estado', value: 'En desarrollo' },
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

      const champion = resolveChampion(matches, standings, clubs);
      expect(champion).toBeDefined();
      expect(champion?.name).toBe('Huracán');
      expect(champion?.title).toBe('CAMPEÓN DEL TORNEO');
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
      const champion = resolveChampion(matches, undefined, clubs);
      expect(champion).toBeDefined();
      expect(champion?.name).toBe('Real Madrid');
      expect(champion?.abbreviation).toBe('RMA');
      expect(champion?.emblemObjectId).toBe('rma-emblem');
      expect(champion?.record).toContain('GANADOR DE LA GRAN FINAL (3 - 1)');
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
      const champion = resolveChampion(matches, undefined, clubs);
      expect(champion).toBeDefined();
      expect(champion?.name).toBe('Arsenal');
      expect(champion?.abbreviation).toBe('ARS');
      expect(champion?.emblemObjectId).toBe('ars-emblem');
      expect(champion?.record).toContain('GANADOR DE LA GRAN FINAL (2 - 1)');
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

      const leader = resolveChampion(matches, standings);
      expect(leader?.title).toBe('LÍDER DE LA TABLA');
      expect(leader?.name).toBe('Huracán');
    });

    it('returns undefined if no matches or standings exist or no winner resolved', () => {
      expect(resolveChampion([], [])).toBeUndefined();
      expect(
        resolveChampion(
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
      const res = resolveChampion([], standings);
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
      const champion = resolveChampion(matches);
      expect(champion?.name).toBe('Winner');
    });
  });
});
