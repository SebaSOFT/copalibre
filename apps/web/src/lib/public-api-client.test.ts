import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { fetchOverview, fetchLive, fetchBracket } from './public-api-client.js';

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
});
