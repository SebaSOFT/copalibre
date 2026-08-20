import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LoadMatchDataRoute } from './LoadMatchDataRoute.js';
import { withIntl } from '../i18n/test-support.js';
import { buildMatchDataCsv, type MATCH_DATA_CSV_COLUMNS } from '../lib/match-data-builder.js';
import {
  ControlApiError,
  type BulkLoadMatchDataRequest,
  type MatchConsoleApiClient,
  type MatchConsoleResponse,
  type RosterCandidate,
} from '../lib/api-client.js';

const ENTRANT_HOME = 'entrant-home';
const ENTRANT_AWAY = 'entrant-away';

/** Builds a CSV `File` fixture from partial row objects, aligned to the real column list. */
function csvFile(rows: Partial<Record<(typeof MATCH_DATA_CSV_COLUMNS)[number], string>>[]): File {
  return new File([buildMatchDataCsv(rows)], 'match.csv', { type: 'text/csv' });
}

const CANDIDATES: Record<string, readonly RosterCandidate[]> = {
  [ENTRANT_HOME]: [{ personId: 'person-h1', name: 'Home One' }],
  [ENTRANT_AWAY]: [{ personId: 'person-a1', name: 'Away One' }],
};

function scheduledProjection(overrides: Partial<MatchConsoleResponse> = {}): MatchConsoleResponse {
  return {
    matchId: 'match-1',
    status: 'scheduled',
    result: null,
    liveScores: [],
    segments: [],
    runningTimers: [],
    events: [],
    eventDefinitions: [
      {
        code: 'goal',
        label: 'Goal',
        category: 'positive',
        permittedSegmentTypes: ['half'],
        actorRequirement: 'person',
        payloadSchema: {},
        display: {},
        secondaryActorFields: [],
      },
    ],
    eligiblePersonIds: [],
    rosters: [],
    rosterRoles: [],
    eligibleStaffIds: [],
    entrantIds: [ENTRANT_HOME, ENTRANT_AWAY],
    capabilities: ['match.select-roster', 'match.record-event', 'match.finalize'],
    projectionVersion: 1,
    ...overrides,
  };
}

function client(overrides: Partial<MatchConsoleApiClient> = {}): MatchConsoleApiClient {
  return {
    fetchMatchConsole: async () => scheduledProjection(),
    fetchMatchRosters: async () => [],
    fetchRosterCandidates: async (_org, _tournament, _matchId, entrantId) =>
      CANDIDATES[entrantId] ?? [],
    setMatchRoster: async () => scheduledProjection(),
    adjustMatchClock: async () => scheduledProjection(),
    resolveMatchTimer: async () => scheduledProjection(),
    recordMatchEvent: async () => {
      throw new Error('not used in this test');
    },
    finalizeMatch: async () => {
      throw new Error('not used in this test');
    },
    bulkLoadMatch: async () => ({ matchId: 'match-1', status: 'finalized', eventCount: 1 }),
    ...overrides,
  };
}

function renderRoute(api: MatchConsoleApiClient) {
  return render(
    withIntl(
      <LoadMatchDataRoute
        client={api}
        matchId="match-1"
        organizationAlias="liga-mendocina"
        tournamentAlias="apertura-2026"
      />,
    ),
  );
}

describe('LoadMatchDataRoute', () => {
  it('shows a forbidden message when the subject lacks a required capability', async () => {
    const api = client({
      fetchMatchConsole: async () => scheduledProjection({ capabilities: ['match.select-roster'] }),
    });
    await act(async () => renderRoute(api));

    expect(screen.getByText(/do not hold the capabilities/i)).toBeDefined();
  });

  it('refuses a match that already has recorded activity', async () => {
    const api = client({
      fetchMatchConsole: async () =>
        scheduledProjection({
          segments: [
            { segmentId: 's1', type: 'half', number: 1, state: 'completed', elapsedSeconds: 0 },
          ],
        }),
    });
    await act(async () => renderRoute(api));

    expect(screen.getByText(/already has recorded activity/i)).toBeDefined();
  });

  it('builds and submits a batch from the manual roster/segment/event builder', async () => {
    const submitted: BulkLoadMatchDataRequest[] = [];
    const api = client({
      bulkLoadMatch: async (_org, _tournament, _matchId, request) => {
        submitted.push(request);
        return { matchId: 'match-1', status: 'finalized', eventCount: submitted.length };
      },
    });
    await act(async () => renderRoute(api));

    await waitFor(() => expect(screen.getByText('Home One')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Home One'));

    fireEvent.click(screen.getByRole('button', { name: 'Add segment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }));

    fireEvent.click(screen.getByRole('button', { name: 'Submit match data' }));

    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(submitted[0]?.rosters).toEqual([
      { entrantId: ENTRANT_HOME, members: [{ personId: 'person-h1', onField: false }] },
    ]);
    expect(submitted[0]?.segments).toEqual([{ type: '' }]);
    expect(submitted[0]?.events).toHaveLength(1);
    expect(await screen.findByText(/1 event\(s\) recorded/i)).toBeDefined();
  });

  it('keeps entered data in place and shows the server message on a refused submission', async () => {
    const api = client({
      bulkLoadMatch: async () => {
        throw new ControlApiError(400, 'Entry 1 ("goal"): invalid segment');
      },
    });
    await act(async () => renderRoute(api));

    await waitFor(() => expect(screen.getByText('Home One')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Home One'));
    fireEvent.click(screen.getByRole('button', { name: 'Add segment' }));

    fireEvent.click(screen.getByRole('button', { name: 'Submit match data' }));

    expect(await screen.findByText('Entry 1 ("goal"): invalid segment')).toBeDefined();
    // The roster checkbox chosen before submitting is still checked — nothing was reset.
    expect((screen.getByLabelText('Home One') as HTMLInputElement).checked).toBe(true);
  });

  it('loads a well-formed CSV import into the same builder for review', async () => {
    const api = client();
    await act(async () => renderRoute(api));
    await waitFor(() => expect(screen.getByText('Home One')).toBeDefined());

    const file = csvFile([
      {
        type: 'roster',
        entrantId: ENTRANT_HOME,
        personName: 'Home One',
        number: '7',
        onField: 'true',
      },
      { type: 'segment', segmentType: 'half', elapsedSeconds: '2700' },
      {
        type: 'event',
        definitionCode: 'goal',
        segmentNumber: '1',
        occurredAt: '2025-03-15T15:32:00Z',
        side: ENTRANT_HOME,
      },
    ]);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(await screen.findByDisplayValue('7')).toBeDefined();
    expect(screen.getByDisplayValue('half')).toBeDefined();
  });

  it('reports CSV row errors without touching the builder', async () => {
    const api = client();
    await act(async () => renderRoute(api));
    await waitFor(() => expect(screen.getByText('Home One')).toBeDefined());

    const file = csvFile([
      { type: 'roster', entrantId: ENTRANT_HOME, personName: 'Unknown Person' },
    ]);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(await screen.findByText(/problem\(s\) found/i)).toBeDefined();
    expect(screen.getByText(/Unknown Person/)).toBeDefined();
  });

  it('renders a loading state before the projection resolves', () => {
    const api = client({ fetchMatchConsole: () => new Promise(() => {}) });
    renderRoute(api);
    expect(screen.getByText('Loading…')).toBeDefined();
  });

  it('shows a load-failed message when fetchMatchConsole rejects', async () => {
    const api = client({
      fetchMatchConsole: async () => {
        throw new Error('boom');
      },
    });
    await act(async () => renderRoute(api));
    expect(await screen.findByText(/Could not load this match/i)).toBeDefined();
  });
});
