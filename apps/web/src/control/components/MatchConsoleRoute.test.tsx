import { render, screen, waitFor } from '@testing-library/react';
import { MatchConsoleRoute } from './MatchConsoleRoute.js';
import { withIntl } from '../i18n/test-support.js';
import type { MatchConsoleApiClient, MatchConsoleResponse } from '../lib/api-client.js';

function mockProjection(overrides: Partial<MatchConsoleResponse> = {}): MatchConsoleResponse {
  return {
    matchId: 'match-1',
    status: 'in-progress',
    result: null,
    liveScores: [
      { entrantId: 'entrant-home', score: 2, statistics: {} },
      { entrantId: 'entrant-away', score: 1, statistics: {} },
    ],
    segments: [
      {
        segmentId: 'seg-1',
        number: 1,
        type: 'half',
        state: 'active',
        elapsedSeconds: 1200,
        durationSeconds: 2700,
      },
    ],
    runningTimers: [],
    events: [
      {
        eventId: 'ev-1',
        sequence: 1,
        definitionCode: 'goal',
        occurredAt: '2026-08-25T19:00:00.000Z',
        segmentId: 'seg-1',
        segmentElapsedSeconds: 600,
        notes: 'Great goal',
      },
    ],
    eventDefinitions: [
      {
        code: 'goal',
        label: 'Goal',
        category: 'positive',
        permittedSegmentTypes: ['half'],
        actorRequirement: 'person',
        payloadSchema: {},
        display: { color: 'var(--cl-state-live)' },
        secondaryActorFields: [],
      },
    ],
    eligiblePersonIds: [],
    rosters: [
      {
        entrantId: 'entrant-home',
        teamName: 'Godoy Cruz',
        members: [{ personId: 'p-1', name: 'Player 1', number: 10, onField: true, roles: [] }],
      },
    ],
    rosterRoles: [],
    eligibleStaffIds: [],
    entrantIds: ['entrant-home', 'entrant-away'],
    capabilities: [
      'match.control-clock',
      'match.record-event',
      'match.finalize',
      'match.select-roster',
    ],
    projectionVersion: 1,
    ...overrides,
  };
}

function stubClient(projection = mockProjection()): MatchConsoleApiClient {
  return {
    fetchMatchConsole: () => Promise.resolve(projection),
    adjustMatchClock: () =>
      Promise.resolve({ matchId: 'match-1', elapsedSeconds: 1200, segmentId: 'seg-1' }),
    recordMatchEvent: () => Promise.resolve({ eventId: 'ev-2' }),
    finalizeMatch: () => Promise.resolve({ matchId: 'match-1', status: 'completed' }),
    resolveMatchTimer: () => Promise.resolve({ timerId: 't-1' }),
    fetchRosterCandidates: () => Promise.resolve([]),
    saveMatchRoster: () => Promise.resolve({ matchId: 'match-1', rosters: [] }),
  } as unknown as MatchConsoleApiClient;
}

describe('MatchConsoleRoute', () => {
  it('renders within MatchConsoleTemplate layout with header, primary workspace, and event detail rail', async () => {
    const { container } = render(
      withIntl(
        <MatchConsoleRoute
          client={stubClient()}
          matchId="match-1"
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByRole('heading', { level: 1, name: /match operations/i }));
    expect(container.querySelector('.cl-match-console-screen')).not.toBeNull();
    expect(container.querySelector('.cl-match-console-screen__header')).not.toBeNull();
    expect(container.querySelector('.cl-match-console-screen__workspace')).not.toBeNull();
    expect(container.querySelector('.cl-match-console-screen__primary')).not.toBeNull();
    expect(container.querySelector('.cl-match-console-screen__rail')).not.toBeNull();
    expect(container.querySelector('.cl-match-console-screen__scoreboard')).not.toBeNull();
    expect(screen.getByText('Match operations')).toBeDefined();
    expect(screen.getByText('Event ledger')).toBeDefined();
    expect(screen.getByText('Clock and period')).toBeDefined();
  });
});
