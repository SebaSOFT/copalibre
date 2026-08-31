import type { ReviewRegistrationRow } from '../components/RegistrationReviewPage.js';
import type { DisciplineOption } from './wizard.js';

export function sampleDisciplines(): readonly DisciplineOption[] {
  return [
    {
      descriptorId: '01890000-0000-7000-8000-000000000001',
      version: '1.2.0',
      name: { en: 'Football', es: 'Fútbol' },
      description: {
        en: 'Team discipline with timed halves and goal-based scoring',
        es: 'Disciplina por equipos con tiempos cronometrados y goles',
      },
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
