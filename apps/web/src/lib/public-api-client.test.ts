import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  fetchOverview,
  fetchLive,
  fetchBracket,
  mapOverviewResponse,
  mapLiveResponse,
  mapBracketResponse,
} from './public-api-client.js';

describe('public-api-client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    process.env.COPALIBRE_API_INTERNAL_URL = 'http://api.test';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    delete process.env.COPALIBRE_API_INTERNAL_URL;
  });

  describe('fetchOverview', () => {
    it('returns parsed json on 200', async () => {
      const mockData = { tournamentAlias: 'test' };
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockData,
      } as unknown as Response);

      const result = await fetchOverview('org1', 'tourney1');
      expect(result).toEqual(mockData);
      expect(fetch).toHaveBeenCalledWith(
        'http://api.test/organizations/org1/tournaments/tourney1/overview',
      );
    });

    it('returns undefined on 404', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as unknown as Response);

      const result = await fetchOverview('org1', 'tourney1');
      expect(result).toBeUndefined();
    });

    it('throws on non-404 failure', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as unknown as Response);

      await expect(fetchOverview('org1', 'tourney1')).rejects.toThrow(/500 Internal Server Error/);
    });
  });

  describe('fetchLive', () => {
    it('returns parsed json on 200', async () => {
      const mockData = { matches: [] };
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockData,
      } as unknown as Response);

      const result = await fetchLive('org1', 'tourney1');
      expect(result).toEqual(mockData);
      expect(fetch).toHaveBeenCalledWith(
        'http://api.test/organizations/org1/tournaments/tourney1/live',
      );
    });

    it('returns undefined on 404', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as unknown as Response);

      const result = await fetchLive('org1', 'tourney1');
      expect(result).toBeUndefined();
    });

    it('throws on non-404 failure', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as unknown as Response);

      await expect(fetchLive('org1', 'tourney1')).rejects.toThrow(/500 Internal Server Error/);
    });
  });

  describe('fetchBracket', () => {
    it('returns parsed json on 200', async () => {
      const mockData = { matches: [] };
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockData,
      } as unknown as Response);

      const result = await fetchBracket('org1', 'tourney1', 1);
      expect(result).toEqual(mockData);
      expect(fetch).toHaveBeenCalledWith(
        'http://api.test/organizations/org1/tournaments/tourney1/stages/1/bracket',
      );
    });

    it('returns undefined on 404', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as unknown as Response);

      const result = await fetchBracket('org1', 'tourney1', '1');
      expect(result).toBeUndefined();
    });

    it('throws on non-404 failure', async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as unknown as Response);

      await expect(fetchBracket('org1', 'tourney1', 1)).rejects.toThrow(
        /500 Internal Server Error/,
      );
    });
  });
  describe('mapOverviewResponse', () => {
    it('maps correctly', () => {
      const response = {
        organizationAlias: 'org',
        tournamentAlias: 't',
        organizationName: 'Org',
        tournamentName: 'T',
        seasonName: 'S',
        ruleset: { pointsForWin: 3 },
        matches: [
          {
            stageNumber: 1,
            homeName: 'H',
            homeAbbreviation: 'H',
            homeScore: 1,
            awayName: 'A',
            awayAbbreviation: 'A',
            awayScore: 0,
            status: 'completed',
            scheduledAt: '2020',
          },
        ],
        standingsPreview: [
          {
            rank: 1,
            name: 'H',
            abbreviation: 'H',
            statistics: { played: 1, points: 3 },
          },
        ],
      };
      const result = mapOverviewResponse(
        response as unknown as Parameters<typeof mapOverviewResponse>[0],
      );
      expect(result.organizationAlias).toBe('org');
      expect(result.ruleset).toEqual([{ label: 'pointsForWin', value: 3 }]);
      expect(result.matches[0].home.name).toBe('H');
      expect(result.standings[0].points).toBe(3);
    });

    it('handles missing fields gracefully', () => {
      const response = {
        organizationAlias: 'org',
        tournamentAlias: 't',
        organizationName: 'Org',
        tournamentName: 'T',
        seasonName: 'S',
        ruleset: {},
        matches: [
          {
            stageNumber: 1,
            status: 'pending',
          },
        ],
        standingsPreview: [
          {
            rank: 1,
            name: 'H',
            abbreviation: 'H',
            statistics: {},
          },
        ],
      };
      const result = mapOverviewResponse(
        response as unknown as Parameters<typeof mapOverviewResponse>[0],
      );
      expect(result.matches[0].home.name).toBe('TBD');
      expect(result.matches[0].startsAt).toBe('');
      expect(result.standings[0].played).toBe(0);
    });
  });

  describe('mapLiveResponse', () => {
    it('maps correctly', () => {
      const response = {
        matches: [
          {
            matchId: 'm1',
            matchNumber: 1,
            state: 'in-progress',
            projectionVersion: 2,
            sides: [{ entrantId: 'e1', name: 'A', abbreviation: 'A', score: 1 }],
          },
        ],
      };
      const result = mapLiveResponse(response as unknown as Parameters<typeof mapLiveResponse>[0]);
      expect(result.usingLastKnown).toBe(true);
      expect(result.matches[0].matchId).toBe('m1');
      expect(result.matches[0].sides[0].entrantId).toBe('e1');
      expect(result.matches[0].sides[0].state).toBe('in-progress');
    });
  });

  describe('mapBracketResponse', () => {
    it('maps correctly for entrant and winner-of / loser-of', () => {
      const response = {
        matches: [
          {
            position: 1,
            round: 1,
            bracket: 'winners',
            status: 'completed',
            slots: [
              { kind: 'entrant', name: 'A', abbreviation: 'A', score: 1 },
              { kind: 'winner-of', matchId: '2', score: 0 },
              { kind: 'loser-of', matchId: '3', score: 0 },
              { kind: 'entrant' }, // missing name
            ],
          },
        ],
      };
      const result = mapBracketResponse(
        response as unknown as Parameters<typeof mapBracketResponse>[0],
      );
      expect(result.matches[0].matchNumber).toBe(1);
      expect(result.matches[0].slots[0]).toEqual({ kind: 'entrant', name: 'A', abbreviation: 'A' });
      expect(result.matches[0].slots[1]).toEqual({ kind: 'winner-of', matchNumber: 2 });
      expect(result.matches[0].slots[2]).toEqual({ kind: 'loser-of', matchNumber: 3 });
      expect(result.matches[0].slots[3]).toEqual({
        kind: 'entrant',
        name: 'TBD',
        abbreviation: undefined,
      });
      expect(result.matches[0].scores).toEqual([1, 0, 0, undefined]);
    });

    it('handles missing matchId for winner/loser', () => {
      const response = {
        matches: [
          {
            position: 1,
            round: 1,
            bracket: 'winners',
            status: 'completed',
            slots: [
              { kind: 'winner-of', score: 0 },
              { kind: 'loser-of', score: 0 },
            ],
          },
        ],
      };
      const result = mapBracketResponse(
        response as unknown as Parameters<typeof mapBracketResponse>[0],
      );
      expect(result.matches[0].slots[0]).toEqual({ kind: 'winner-of', matchNumber: 0 });
      expect(result.matches[0].slots[1]).toEqual({ kind: 'loser-of', matchNumber: 0 });
    });
  });
});
