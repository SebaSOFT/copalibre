import { describe, expect, it } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DisciplineDescriptor, RecordedOutcome } from '@copalibre/domain';
import { traceForEntrant, traceLines, type TiebreakPipeline } from '@copalibre/rules';
import { computeStandings } from '@copalibre/tournament-engine';
import { StandingsPage } from './components/StandingsPage.js';
import type { TableLayoutSummaryResponse, TableProjectionResponseData } from './lib/api-client.js';
import { withIntl } from './i18n/test-support.js';

/**
 * The contract that makes "explainable" true rather than aspirational.
 *
 * Not a snapshot of either side. A snapshot of the engine passes while the
 * screen renders something else entirely, and a snapshot of the screen passes
 * while the engine changes underneath it. This runs both halves against one
 * fixture and asserts the text an operator reads is the text the engine
 * produced — byte for byte.
 *
 * If it fails after a change to `packages/rules`, the trace format moved and
 * the screen has not: that is the drift this test exists to catch, and the fix
 * is never to reformat here.
 */

/** Three-way tie on points, separated only by the second and third comparators. */
const descriptor = {
  descriptorId: 'contract-liga',
  version: '1.0.0',
  name: 'Liga de contrato',
  attribution: { author: 'CopaLibre', licence: 'AGPL-3.0-only' },
  participantTypes: ['team'],
  rosterConstraints: { minPlayers: 1, maxPlayers: 11 },
  segmentTypes: [],
  eventDefinitions: [],
  statistics: [
    { code: 'played', label: 'Partidos', aggregation: 'count' },
    { code: 'points', label: 'Puntos', aggregation: 'sum' },
    { code: 'goals-for', label: 'A favor', aggregation: 'sum' },
  ],
  scoringInputs: [],
  availableFormats: ['round-robin'],
  notificationRuleCapabilities: [],
  winCondition: {},
  defaults: {},
  fieldPolicies: {},
} as unknown as DisciplineDescriptor;

const pipeline: TiebreakPipeline = {
  id: 'contract',
  version: 1,
  parameters: [
    {
      id: 'points',
      label: 'Puntos',
      valueType: 'number',
      direction: 'higher_wins',
      missingValue: 'treat-as-zero',
      source: 'calculated',
    },
    {
      id: 'goals-for',
      label: 'A favor',
      valueType: 'number',
      direction: 'higher_wins',
      missingValue: 'treat-as-zero',
      source: 'calculated',
    },
  ],
};

const entrantIds = ['tll', 'ind', 'gim'] as const;

/**
 * Two sides tie on points and are separated only by the second comparator; the
 * third is separated by the first. One fixture, both cases the screen has to
 * get right — a trace where a comparator intervened, and no trace where none
 * did.
 */
const outcomes: readonly RecordedOutcome[] = [
  {
    matchId: 'm1',
    sides: [
      { entrantId: 'tll', statistics: { points: 3, 'goals-for': 4 } },
      { entrantId: 'gim', statistics: { points: 0, 'goals-for': 1 } },
    ],
  },
  {
    matchId: 'm2',
    sides: [
      { entrantId: 'ind', statistics: { points: 3, 'goals-for': 2 } },
      { entrantId: 'gim', statistics: { points: 0, 'goals-for': 0 } },
    ],
  },
];

function standingsOf(): ReturnType<typeof computeStandings> {
  return computeStandings(descriptor, [...entrantIds], outcomes, pipeline);
}

describe('tiebreak trace contract', () => {
  it('the engine produces a multi-comparator trace for this fixture', () => {
    const standings = standingsOf();

    expect(standings.trace.length).toBeGreaterThan(1);
    expect(standings.trace[0]).toMatchObject({ kind: 'comparator', id: 'points' });
    expect(traceLines(standings.trace)[0]).toContain('Rule 1 (Puntos)');
  });

  it('renders the engine’s trace text byte-for-byte', async () => {
    const standings = standingsOf();
    const tied = standings.rows.find(
      (row) => row.entrantId === 'ind',
    ) as (typeof standings.rows)[number];

    // Exactly the composition the API performs: filter to the row, render to
    // lines. Nothing between the engine and the DOM reformats anything.
    const expected = traceLines(
      traceForEntrant(standings.trace, tied.entrantId, { stillTied: tied.sharedRank }),
    );
    expect(expected.length).toBeGreaterThan(0);

    // Exactly the shape `TableProjectionsController` serves for a
    // `group-phase` layout: a `name` column (defaulting to the entrant id,
    // as this screen always did with no separate name mapping) and a
    // `points` column, both pre-formatted.
    const layout: TableLayoutSummaryResponse = {
      code: 'group-standings-default',
      target: 'group-phase',
      label: 'Group Standings',
      entityGranularity: 'team',
    };
    const projection: TableProjectionResponseData = {
      layoutCode: layout.code,
      target: layout.target,
      label: layout.label,
      columns: [
        { code: 'name', header: 'Team', format: 'text' },
        { code: 'points', header: 'Points', format: 'number' },
      ],
      defaultSort: [{ columnCode: 'points', direction: 'desc' }],
      rows: standings.rows.map((row) => ({
        actorId: row.entrantId,
        entrantId: row.entrantId,
        rank: row.rank,
        sharedRank: row.sharedRank,
        cells: {
          name: { formatted: row.entrantId },
          points: { raw: row.statistics.points, formatted: String(row.statistics.points ?? 0) },
        },
      })),
      projectionVersion: 4,
    };

    render(
      withIntl(
        <StandingsPage
          activeLayoutCode={layout.code}
          layouts={[layout]}
          onExpand={(actorId) =>
            Promise.resolve(
              traceLines(
                traceForEntrant(standings.trace, actorId, {
                  stillTied:
                    standings.rows.find((row) => row.entrantId === actorId)?.sharedRank ?? false,
                }),
              ),
            )
          }
          organizationAlias="liga-mendocina"
          projection={projection}
          tournamentName="Apertura 2026"
        />,
      ),
    );

    // jsdom does not run the native summary activation behaviour, so the
    // disclosure is opened the way the browser would leave it.
    const row = screen
      .getAllByText(tied.entrantId)
      .map((node) => node.closest('details'))
      .find((node): node is HTMLDetailsElement => node !== null) as HTMLDetailsElement;
    row.open = true;
    fireEvent(row, new Event('toggle'));

    const panel = await screen.findByLabelText('Tiebreak trace');
    await waitFor(() =>
      expect([...panel.querySelectorAll('li')].map((item) => item.textContent ?? '')).toEqual(
        expected,
      ),
    );
  });

  it('offers no trace on a row no comparator had to separate', () => {
    const standings = standingsOf();
    const untied = standings.rows.find(
      (row) => traceForEntrant(standings.trace, row.entrantId).length === 0,
    );

    expect(untied?.entrantId).toBe('gim');
  });
});
