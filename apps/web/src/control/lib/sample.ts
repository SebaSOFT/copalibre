import type { ActivityEntry, TournamentCard } from './dashboard.js';

/** Sample dashboard data until the control API lands; replaced, not extended. */
export function sampleDashboardData(): {
  readonly organizationId: string;
  readonly tournaments: readonly TournamentCard[];
  readonly activity: readonly ActivityEntry[];
} {
  return {
    organizationId: 'org-1',
    tournaments: [
      {
        tournamentId: 't-1',
        organizationId: 'org-1',
        alias: 'apertura-2026',
        name: 'Torneo Apertura 2026',
        lifecycle: 'live',
        matchesToday: 3,
        pendingRegistrations: 2,
      },
      {
        tournamentId: 't-2',
        organizationId: 'org-1',
        alias: 'clausura-2026',
        name: 'Torneo Clausura 2026',
        lifecycle: 'draft',
        matchesToday: 0,
        pendingRegistrations: 7,
      },
    ],
    activity: [
      {
        auditId: 'a-1',
        organizationId: 'org-1',
        action: 'registration.approved',
        actor: 'user:organizer-1',
        occurredAt: '2026-08-01T20:00:00.000Z',
        reason: 'Documentación completa',
      },
    ],
  };
}
