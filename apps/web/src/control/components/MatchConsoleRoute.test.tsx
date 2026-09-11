import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { MatchConsoleRoute } from './MatchConsoleRoute.js';
import { withIntl } from '../i18n/test-support.js';
import { ControlApiError } from '../lib/api-client.js';
import type { MatchConsoleApiClient, MatchConsoleResponse } from '../lib/api-client.js';
import { clearAll } from '../lib/offline-queue.js';

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
    entrants: [
      { entrantId: 'entrant-home', name: 'Club Atlético' },
      { entrantId: 'entrant-away', name: 'Deportivo Cuyo' },
    ],
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
  // finalize() (and other mutations) write through the durable offline
  // queue (fake-indexeddb, installed globally in jest.setup.cjs), which
  // persists across tests in this file unless cleared — the same reason
  // offline-queue.test.ts clears it before every test of its own.
  beforeEach(async () => {
    await clearAll();
  });

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

  it('sends no winner derived from a jersey tap; the confirmation defaults to no winner selected', async () => {
    const finalizeMatch = jest.fn(() =>
      Promise.resolve({ matchId: 'match-1', status: 'completed' as const }),
    );
    const client = { ...stubClient(), finalizeMatch } as unknown as MatchConsoleApiClient;

    const { container } = render(
      withIntl(
        <MatchConsoleRoute
          client={client}
          matchId="match-1"
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );
    await waitFor(() => screen.getByRole('heading', { level: 1, name: /match operations/i }));

    // A jersey tap sets event-attribution state (selectedSide) for an
    // unrelated purpose — who performed the next logged event. It must not
    // leak into the finalize winner.
    fireEvent.click(screen.getByRole('button', { name: 'Player 1' }));

    fireEvent.click(screen.getByRole('button', { name: 'Finalize match' }));

    // The confirmation names the outcome it commits: both entrants and
    // their frozen scores are visible while confirming, before it closes.
    expect(container.querySelector('#finalize-winner-entrant-home')).not.toBeNull();
    expect(container.querySelector('#finalize-winner-entrant-away')).not.toBeNull();

    // The "no winner" option is the default selection; confirm without
    // touching the winner control at all.
    fireEvent.click(screen.getByRole('button', { name: 'Confirm finalization' }));

    // Asserts on every call rather than requiring exactly one: the console
    // also auto-drains the durable queue on mount, independent of this
    // direct confirm flow, which is a pre-existing, unrelated concern to
    // this test's claim (finalize() itself must never derive a winner from
    // JerseyGrid's attribution state).
    await waitFor(() => expect(finalizeMatch.mock.calls.length).toBeGreaterThan(0));
    for (const call of finalizeMatch.mock.calls) {
      const [organizationAlias, tournamentAlias, matchId, request, idempotencyKey] =
        call as unknown as [string, string, string, object, string];
      expect(organizationAlias).toBe('liga-mendocina');
      expect(tournamentAlias).toBe('apertura-2026');
      expect(matchId).toBe('match-1');
      expect(request).not.toHaveProperty('winnerEntrantId');
      expect(typeof idempotencyKey).toBe('string');
      expect(idempotencyKey.length).toBeGreaterThan(0);
    }
  });

  it('sends the explicitly selected winner, independent of any jersey tap', async () => {
    const finalizeMatch = jest.fn(() =>
      Promise.resolve({ matchId: 'match-1', status: 'completed' as const }),
    );
    const client = { ...stubClient(), finalizeMatch } as unknown as MatchConsoleApiClient;

    const { container } = render(
      withIntl(
        <MatchConsoleRoute
          client={client}
          matchId="match-1"
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );
    await waitFor(() => screen.getByRole('heading', { level: 1, name: /match operations/i }));

    // Attribute an event to the away side...
    fireEvent.click(screen.getByRole('button', { name: 'Player 1' }));

    fireEvent.click(screen.getByRole('button', { name: 'Finalize match' }));
    // ...then explicitly pick the home side as winner in the confirmation —
    // the opposite of what the jersey tap alone would have implied.
    const homeWinnerRadio = container.querySelector('#finalize-winner-entrant-home');
    expect(homeWinnerRadio).not.toBeNull();
    fireEvent.click(homeWinnerRadio as Element);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm finalization' }));

    await waitFor(() => expect(finalizeMatch).toHaveBeenCalledTimes(1));
    const [, , , request] = finalizeMatch.mock.calls[0] as unknown as [
      string,
      string,
      string,
      { winnerEntrantId?: string },
    ];
    expect(request.winnerEntrantId).toBe('entrant-home');
  });

  it('preserves the idempotency key and the selected winner across a rejected finalize, for a retry to resend unchanged', async () => {
    const finalizeMatch = jest
      .fn<() => Promise<{ matchId: string; status: 'completed' }>>()
      .mockRejectedValueOnce(new ControlApiError(409, 'Conflict'))
      .mockResolvedValueOnce({ matchId: 'match-1', status: 'completed' as const });
    const client = { ...stubClient(), finalizeMatch } as unknown as MatchConsoleApiClient;

    const { container } = render(
      withIntl(
        <MatchConsoleRoute
          client={client}
          matchId="match-1"
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );
    await waitFor(() => screen.getByRole('heading', { level: 1, name: /match operations/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Finalize match' }));
    fireEvent.click(container.querySelector('#finalize-winner-entrant-home') as Element);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm finalization' }));

    await waitFor(() => expect(finalizeMatch).toHaveBeenCalledTimes(1));
    // Rejected: the confirmation stays open rather than closing, so the
    // operator retries the same commit instead of starting over. Waiting
    // for the button itself to re-enable (not just for the API call to have
    // happened) matters here: finalize()'s `finally` block re-enables it
    // asynchronously, after the call this waitFor already observed.
    expect(container.querySelector('#finalize-winner-entrant-home')).not.toBeNull();
    const confirmButton = screen.getByRole('button', {
      name: 'Confirm finalization',
    }) as HTMLButtonElement;
    await waitFor(() => expect(confirmButton.disabled).toBe(false));

    fireEvent.click(confirmButton);
    await waitFor(() => expect(finalizeMatch).toHaveBeenCalledTimes(2));

    const [, , , firstRequest, firstKey] = finalizeMatch.mock.calls[0] as unknown as [
      string,
      string,
      string,
      { winnerEntrantId?: string },
      string,
    ];
    const [, , , secondRequest, secondKey] = finalizeMatch.mock.calls[1] as unknown as [
      string,
      string,
      string,
      { winnerEntrantId?: string },
      string,
    ];
    expect(secondKey).toBe(firstKey);
    expect(secondRequest).toEqual(firstRequest);
    expect(secondRequest.winnerEntrantId).toBe('entrant-home');
  });
});
