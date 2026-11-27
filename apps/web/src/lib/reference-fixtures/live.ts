/** Live, series and TV fixtures: the running match dashboards and the launcher address. */

import type { LiveDashboard } from '../live-state.js';
import type { PublicSeriesState } from '../series.js';
import { REFERENCE_ENTRANTS } from './entrants.ts';

/** Best-of-five projection; the production series helper supplies segment states. */
export function referenceSeries(): PublicSeriesState {
  return {
    span: 5,
    resolutionClass: 'best-of',
    games: [
      { number: 1, status: 'finalized', winner: 'home', scores: [16, 12] },
      { number: 2, status: 'finalized', winner: 'away', scores: [10, 16] },
      { number: 3, status: 'finalized', winner: 'home', scores: [16, 14] },
      { number: 4, status: 'in-progress' },
      { number: 5, status: 'scheduled' },
    ],
    homeGamesWon: 2,
    awayGamesWon: 1,
    status: 'undecided',
    explanation: 'Demonstration: first to three game wins; game four is in progress.',
  };
}

/**
 * The live match: Meridian Seven leading Ironclad Five 3:1, part-way through.
 *
 * Stage 2, not stage 1 — the group above already records these two meeting, and
 * one pairing cannot hold two different results at once.
 *
 * `usingLastKnown` is false because this fixture represents a connected stream;
 * a stale variant is the composition's own state to render, not a second story.
 */
export function referenceLiveDashboard(): LiveDashboard {
  const [home, away] = REFERENCE_ENTRANTS;
  return {
    matches: [
      {
        matchId: '01936f4a-1001-7000-8000-000000000001',
        stageNumber: 2,
        matchNumber: 7,
        state: 'live',
        projectionVersion: 12,
        clockSeconds: 74 * 60,
        sides: [
          {
            entrantId: home.id,
            name: home.name,
            abbreviation: home.abbreviation,
            score: 3,
            state: 'live',
          },
          {
            entrantId: away.id,
            name: away.name,
            abbreviation: away.abbreviation,
            score: 1,
            state: 'live',
          },
        ],
      },
    ],
    standingsVersion: 12,
    usingLastKnown: false,
  };
}

/**
 * A basketball fixture, present so a composition cannot quietly assume football.
 *
 * Its vocabulary is its own: quarters rather than halves, a running score in the
 * dozens, and no clock label a football descriptor would produce. A composition
 * that renders `74'` or a VAR note against this data is reading the wrong
 * descriptor, and that is exactly what this fixture exists to expose.
 */
export function referenceBasketballDashboard(): LiveDashboard {
  const [home, , , , away] = REFERENCE_ENTRANTS;
  return {
    matches: [
      {
        matchId: '01936f4a-1003-7000-8000-000000000003',
        stageNumber: 1,
        matchNumber: 12,
        state: 'live',
        projectionVersion: 41,
        // Third quarter, part-way: segment-relative, not a 90-minute clock.
        clockSeconds: 6 * 60 + 12,
        sides: [
          {
            entrantId: home.id,
            name: home.name,
            abbreviation: home.abbreviation,
            score: 68,
            state: 'live',
          },
          {
            entrantId: away.id,
            name: away.name,
            abbreviation: away.abbreviation,
            score: 71,
            state: 'live',
          },
        ],
      },
    ],
    standingsVersion: 41,
    usingLastKnown: false,
  };
}

/**
 * The address the TV launcher builds for the reference competition: its transparent lower third, in the
 * language the preview asks for. The fixture organization and tournament are the ones the other references use.
 */
export function referenceTvLauncherAddress(language: string): string {
  return `/tv/liga-san-juan/tournaments/copa-premier?lang=${encodeURIComponent(language)}&bg=transparent&mode=overlay-lower`;
}
