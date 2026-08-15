/**
 * Note: This sample data now backs only `apps/web/src/pages/tv/**` routes
 * and unit test fixtures, not the main public live page.
 */
import type { LiveDashboard } from './live-state.js';

/** Sample live state until the read models land; replaced, not extended. */
export function sampleDashboard(): LiveDashboard {
  return {
    matches: [
      {
        matchId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        matchNumber: 1,
        state: 'live',
        projectionVersion: 3,
        sides: [
          {
            entrantId: 'en-1',
            name: 'Talleres de Mendoza',
            abbreviation: 'TLL A',
            score: 2,
            state: 'live',
          },
          {
            entrantId: 'en-2',
            name: 'Casa de Italia',
            abbreviation: 'C I',
            score: 1,
            state: 'live',
          },
        ],
      },
    ],
    standingsVersion: 3,
    usingLastKnown: true,
  };
}
