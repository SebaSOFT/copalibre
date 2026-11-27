/** Tournament listing, overview and audit trail fixtures. */

import { buildOverview, type OverviewModel } from '../overview.js';
import type { PublicTournamentListingItemResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';
import { referenceStandings, referenceWinnerZones } from './standings.ts';
import { referenceGroupMatches } from './schedule.ts';
import { referenceClubs } from './entrants.ts';

/** One entry in the audited correction sequence. */
export interface ReferenceAuditEntry {
  readonly eventNumber: number;
  readonly action: 'SCORE_RECORDED' | 'SCORE_CORRECTION';
  readonly actor: string;
  readonly recordedAt: string;
  readonly matchId: string;
  /** Present only on a correction: what the record said before it. */
  readonly previous?: string;
  readonly resulting: string;
  /** Why the correction was made. A correction without one is not auditable. */
  readonly reason?: string;
}

/**
 * A correction, told as two events on one match rather than as a contradiction.
 *
 * This is a different match from the live 3:1 above, deliberately: a record that
 * is simultaneously 1:1, 2:1 and 3:1 is not a story any surface should present,
 * and the reference screenshot's apparent conflict is a screenshot artefact.
 */
export function referenceAuditTrail(): readonly ReferenceAuditEntry[] {
  const matchId = '01936f4a-1002-7000-8000-000000000002';
  return [
    {
      eventNumber: 1048,
      action: 'SCORE_RECORDED',
      actor: 'table_ref_1',
      recordedAt: '2026-09-05T16:42:10.000Z',
      matchId,
      resulting: '1 - 1',
    },
    {
      eventNumber: 1049,
      action: 'SCORE_CORRECTION',
      actor: 'tournament_director',
      recordedAt: '2026-09-05T16:45:32.000Z',
      matchId,
      previous: '1 - 1',
      resulting: '2 - 1',
      reason: 'Goal at 78′ confirmed by the match report',
    },
  ];
}

/** One tournament in each status, so a listing surface cannot special-case a single state. */
export function referenceTournamentListing(): PublicTournamentListingItemResponse[] {
  return [
    {
      tournamentId: '01936f4a-3001-7000-8000-000000000001',
      alias: 'reference-cup',
      name: 'Reference Cup',
      status: 'live',
      discipline: {
        descriptorId: 'football',
        version: '1',
        name: 'Football',
        localizedName: { en: 'Football', es: 'Fútbol' },
      },
      dates: { startedAt: '2026-09-01T18:00:00.000Z' },
      featured: true,
    },
    {
      tournamentId: '01936f4a-3002-7000-8000-000000000002',
      alias: 'reference-open',
      name: 'Reference Open',
      status: 'upcoming',
      discipline: {
        descriptorId: 'football',
        version: '1',
        name: 'Football',
        localizedName: { en: 'Football', es: 'Fútbol' },
      },
      featured: false,
    },
    {
      tournamentId: '01936f4a-3003-7000-8000-000000000003',
      alias: 'reference-league',
      name: 'Reference League',
      status: 'finished',
      discipline: {
        descriptorId: 'football',
        version: '1',
        name: 'Football',
        localizedName: { en: 'Football', es: 'Fútbol' },
      },
      dates: { startedAt: '2026-08-01T18:00:00.000Z', archivedAt: '2026-08-20T18:00:00.000Z' },
      winners: referenceWinnerZones(),
      featured: false,
    },
  ];
}

/** The public overview model every organization/tournament-listing organism composes against. */
export function referenceOverview(): OverviewModel {
  return buildOverview({
    organizationAlias: 'reference-league',
    tournamentAlias: 'reference-cup',
    organizationName: 'Reference League',
    tournamentName: 'Reference Cup',
    seasonName: '2026',
    status: 'live',
    winners: referenceWinnerZones(),
    matches: referenceGroupMatches(),
    standings: referenceStandings(),
    standingsGrain: 'match',
    clubs: referenceClubs(),
    ruleset: [
      { dotPath: 'format', label: 'Format', value: 'Round Robin' },
      { dotPath: 'legs', label: 'Legs', value: 'Single' },
    ],
    // No `emblemObjectId`: the preview seam has no backend to serve an
    // object-storage asset from, so any URL built from one 404s and the
    // component would show a broken image rather than the placeholder its
    // own empty-emblem path already renders honestly.
  });
}
