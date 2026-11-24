import { describe, expect, it } from '@jest/globals';
import type { PublicOrganizationClubTournamentResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';
import { publicIntl } from './i18n/public-intl.js';
import {
  clubHonours,
  formatClubPlacement,
  formatClubTournamentStatus,
} from './organization-club.js';

const tournament = (
  alias: string,
  placements?: PublicOrganizationClubTournamentResponse['placements'],
): PublicOrganizationClubTournamentResponse => ({
  alias,
  name: alias.toUpperCase(),
  status: 'finished',
  discipline: { descriptorId: 'rink-hockey', version: '1.0.0' },
  ...(placements === undefined ? {} : { placements }),
});

describe('clubHonours', () => {
  it('lists titles first, then runner-up and third places, keeping the tournaments’ order', () => {
    const honours = clubHonours([
      tournament('apertura-2026', [{ place: 'runner-up' }]),
      tournament('clausura-2025'),
      tournament('apertura-2025', [{ place: 'champion', zoneName: 'Copa Oro' }]),
      tournament('apertura-2024', [{ place: 'champion' }, { place: 'third-place' }]),
    ]);

    expect(honours).toEqual([
      {
        place: 'champion',
        zoneName: 'Copa Oro',
        tournamentAlias: 'apertura-2025',
        tournamentName: 'APERTURA-2025',
      },
      { place: 'champion', tournamentAlias: 'apertura-2024', tournamentName: 'APERTURA-2024' },
      { place: 'runner-up', tournamentAlias: 'apertura-2026', tournamentName: 'APERTURA-2026' },
      { place: 'third-place', tournamentAlias: 'apertura-2024', tournamentName: 'APERTURA-2024' },
    ]);
  });

  it('is empty when the club never reached a podium', () => {
    expect(clubHonours([tournament('apertura-2026')])).toEqual([]);
  });
});

describe('formatClubPlacement', () => {
  const intl = publicIntl('es');

  it('names each place in the page language, with its zone when there is one', () => {
    expect(formatClubPlacement({ place: 'champion' }, intl)).toBe(
      intl.formatMessage({ id: 'publicWeb.tournamentsPage.champion' }),
    );
    expect(formatClubPlacement({ place: 'runner-up' }, intl)).toBe(
      intl.formatMessage({ id: 'publicWeb.tournamentsPage.runnerUp' }),
    );
    expect(formatClubPlacement({ place: 'third-place', zoneName: 'Copa Plata' }, intl)).toBe(
      `${intl.formatMessage({ id: 'publicWeb.tournamentsPage.thirdPlace' })} · Copa Plata`,
    );
  });
});

describe('formatClubTournamentStatus', () => {
  const intl = publicIntl('en');

  it('words each status as the organization page does', () => {
    expect(formatClubTournamentStatus('live', intl)).toBe('In progress');
    expect(formatClubTournamentStatus('upcoming', intl)).toBe('Upcoming');
    expect(formatClubTournamentStatus('finished', intl)).toBe('Final');
  });
});
