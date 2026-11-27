/** Player profile fixtures. */

import type { PublicPersonProfileResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';
import { REFERENCE_ENTRANTS } from './entrants.ts';

/** One player profile with both competition history and career statistics populated. */
export function referencePlayerProfile(): PublicPersonProfileResponse {
  return {
    personId: '01936f4a-8001-7000-8000-000000000001',
    displayName: 'Priya Natarajan-Whitfield',
    alias: 'priya-nw',
    nationality: 'IN',
    age: 27,
    competitionHistory: [
      {
        tournamentId: '01936f4a-3001-7000-8000-000000000001',
        tournamentName: 'Reference Cup',
        tournamentAlias: 'reference-cup',
        teamId: '01936f4a-9001-7000-8000-000000000001',
        teamName: 'Meridian Seven',
        role: 'player',
        entrantId: REFERENCE_ENTRANTS[0].id,
        entrantName: REFERENCE_ENTRANTS[0].name,
        entrantAbbreviation: REFERENCE_ENTRANTS[0].abbreviation,
        disciplineDescriptorId: 'football',
        disciplineDescriptorVersion: '1',
        disciplineName: 'Football',
        localizedDisciplineName: { en: 'Football', es: 'Fútbol' },
      },
    ],
    careerStatistics: [
      {
        disciplineDescriptorId: 'football',
        disciplineName: 'Football',
        localizedDisciplineName: { en: 'Football', es: 'Fútbol' },
        statistics: [
          {
            code: 'goals',
            label: 'Goals',
            localizedLabel: {
              en: 'Goals',
              es: 'Goles',
              fr: 'Buts',
              de: 'Tore',
              it: 'Gol',
              pt: 'Gols',
              ru: 'Голы',
              zh: '进球',
            },
            value: 14,
            samples: 22,
          },
          {
            code: 'assists',
            label: 'Assists',
            localizedLabel: {
              en: 'Assists',
              es: 'Asistencias',
              fr: 'Passes décisives',
              de: 'Vorlagen',
              it: 'Assist',
              pt: 'Assistências',
              ru: 'Передачи',
              zh: '助攻',
            },
            value: 6,
            samples: 22,
          },
        ],
      },
    ],
  };
}
