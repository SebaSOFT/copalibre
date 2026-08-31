import { describe, expect, it } from '@jest/globals';
import { pickFeaturedTournament } from './organization-page.js';
import type { PublicTournamentListingItemResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';

const discipline = { descriptorId: 'd-1', version: '1.0.0' };

function tournament(
  overrides: Partial<PublicTournamentListingItemResponse>,
): PublicTournamentListingItemResponse {
  return {
    tournamentId: 't-1',
    alias: 'apertura-2026',
    name: 'Apertura 2026',
    status: 'upcoming',
    discipline,
    ...overrides,
  };
}

describe('pickFeaturedTournament', () => {
  it('picks the live tournament even when a more recent finished one exists', () => {
    const live = tournament({ tournamentId: 'live-1', status: 'live' });
    const finished = tournament({
      tournamentId: 'finished-1',
      status: 'finished',
      dates: { archivedAt: '2026-08-20T00:00:00.000Z' },
    });
    expect(pickFeaturedTournament([finished, live])).toBe(live);
  });

  it('falls back to the most recent by date when there is no live tournament', () => {
    const older = tournament({
      tournamentId: 'older',
      status: 'finished',
      dates: { archivedAt: '2026-01-01T00:00:00.000Z' },
    });
    const newer = tournament({
      tournamentId: 'newer',
      status: 'finished',
      dates: { archivedAt: '2026-08-20T00:00:00.000Z' },
    });
    expect(pickFeaturedTournament([older, newer])).toBe(newer);
  });

  it('prefers archivedAt over startedAt when both are present', () => {
    const startedOnly = tournament({
      tournamentId: 'started-only',
      status: 'upcoming',
      dates: { startedAt: '2026-08-19T00:00:00.000Z' },
    });
    const archivedEarlier = tournament({
      tournamentId: 'archived-earlier',
      status: 'finished',
      dates: { startedAt: '2026-08-01T00:00:00.000Z', archivedAt: '2026-08-20T00:00:00.000Z' },
    });
    expect(pickFeaturedTournament([startedOnly, archivedEarlier])).toBe(archivedEarlier);
  });

  it('returns undefined when there are no tournaments at all', () => {
    expect(pickFeaturedTournament([])).toBeUndefined();
  });
});
