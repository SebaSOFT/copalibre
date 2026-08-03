import type { ActivityEntry, TournamentCard } from './dashboard.js';
import type { ReviewRegistrationRow } from '../components/RegistrationReviewPage.js';
import type { DisciplineOption } from './wizard.js';

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

export function sampleDisciplines(): readonly DisciplineOption[] {
  return [
    {
      descriptorId: '01890000-0000-7000-8000-000000000001',
      version: '1.2.0',
      name: 'Fútbol 11',
      supportedFormats: ['single-elimination', 'round-robin'],
    },
    {
      descriptorId: '01890000-0000-7000-8000-000000000002',
      version: '2.0.0',
      name: 'Natación',
      supportedFormats: ['placement'],
    },
  ];
}

export function sampleRegistrations(): readonly ReviewRegistrationRow[] {
  return [
    {
      entrantId: 'e-1',
      displayName: 'Talleres Azul',
      status: 'pending',
      submittedAt: '2026-07-28T14:00:00.000Z',
      contactEmail: 'delegado@talleres.test',
      teamMembers: ['Ana Suárez', 'Mora Gutiérrez', 'Luz Ortiz'],
      experience: 'Liga local 2025',
      requiresCheckIn: true,
      checkInClosesAt: '2026-08-01T18:00:00.000Z',
    },
    {
      entrantId: 'e-2',
      displayName: 'Casa de Italia',
      status: 'accepted',
      submittedAt: '2026-07-28T15:15:00.000Z',
      contactEmail: 'mesa@casadeitalia.test',
      teamMembers: ['Julia Pérez', 'Camila Ríos', 'Noelia Castro'],
      experience: 'Finalista apertura',
      requiresCheckIn: true,
      checkInClosesAt: '2026-08-01T18:00:00.000Z',
    },
    {
      entrantId: 'e-3',
      displayName: 'San Martín',
      status: 'checked-in',
      submittedAt: '2026-07-28T16:30:00.000Z',
      contactEmail: 'coord@sma.test',
      teamMembers: ['Sofía Molina', 'Pilar Vega', 'Abril Luna'],
      experience: 'Campeón regional',
      requiresCheckIn: true,
      checkInClosesAt: '2026-08-01T18:00:00.000Z',
    },
  ];
}
