/**
 * Note: This sample data now backs only `apps/web/src/pages/tv/**` routes
 * and unit test fixtures, not the main public tournament overview pages.
 */
import type { OverviewInput } from './overview.js';

/**
 * Sample data for the overview until read models are wired.
 *
 * Kept in one named place rather than inlined in the template, so replacing it
 * is a deletion rather than an archaeology exercise — and so nobody mistakes it
 * for something the database returned.
 */
export function sampleOverview(organizationAlias: string, tournamentAlias: string): OverviewInput {
  return {
    organizationAlias,
    tournamentAlias,
    organizationName: 'Liga Mendocina',
    tournamentName: 'Torneo Apertura',
    seasonName: '2026',
    matches: [
      {
        matchNumber: 1,
        stageNumber: 1,
        home: { name: 'Talleres de Mendoza', abbreviation: 'TLL A', score: 2 },
        away: { name: 'Casa de Italia', abbreviation: 'C I', score: 1 },
        state: 'live',
        startsAt: '2026-08-01T20:00:00.000Z',
      },
      {
        matchNumber: 2,
        stageNumber: 1,
        home: { name: 'Club Atlético San Martín' },
        away: { name: 'Independiente Rivadavia' },
        state: 'upcoming',
        startsAt: '2026-08-02T20:00:00.000Z',
      },
    ],
    standings: [
      { position: 1, name: 'Talleres de Mendoza', abbreviation: 'TLL A', played: 3, points: 7 },
      { position: 2, name: 'Casa de Italia', abbreviation: 'C I', played: 3, points: 4 },
    ],
    ruleset: [
      { label: 'Formato', value: 'Todos contra todos' },
      { label: 'Puntos', value: '3 por victoria, 1 por empate' },
    ],
  };
}
