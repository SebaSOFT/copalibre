import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MatchConsolePage } from './components/pages/MatchConsolePage.js';
import {
  ControlApiError,
  type MatchConsoleApiClient,
  type MatchConsoleResponse,
} from './lib/api-client.js';
import { withIntl } from './i18n/test-support.js';
import { clearAll } from './lib/offline-queue.js';
import { client, projection } from './match-console-route.test-support.js';

beforeEach(async () => {
  await clearAll();
});

describe('MatchConsolePage awaiting its entrants', () => {
  const semiSource = (position: number) => ({
    kind: 'winner-of' as const,
    nodeKey: `SE-R1-M${position}`,
    matchId: `semi-${position}`,
    round: 1,
    position,
  });
  const undecidedFinal: MatchConsoleResponse = {
    ...projection,
    status: 'scheduled',
    liveScores: [],
    entrants: [],
    nodeKey: 'SE-R2-M1',
    homeSource: semiSource(1),
    awaySource: semiSource(2),
  };
  const halfDecided: MatchConsoleResponse = {
    ...undecidedFinal,
    entrants: [projection.entrants[0] ?? { entrantId: 'entrant-a' }],
    homeEntrantId: 'entrant-a',
  };
  const decided: MatchConsoleResponse = {
    ...undecidedFinal,
    entrants: projection.entrants,
    homeEntrantId: 'entrant-a',
    awayEntrantId: 'entrant-b',
  };
  const renderConsole = (overrides: Partial<MatchConsoleApiClient>) =>
    act(async () => {
      render(
        withIntl(
          <MatchConsolePage
            client={client(overrides)}
            matchId="match-1"
            organizationAlias="liga"
            tournamentAlias="apertura"
          />,
        ),
      );
    });

  it('states every source it awaits and offers no start, event or result control', async () => {
    await renderConsole({ fetchMatchConsole: async () => undecidedFinal });

    expect(screen.getByText('Awaiting Winner of Round 1, match 1')).toBeDefined();
    expect(screen.getByText('Awaiting Winner of Round 1, match 2')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Gol' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Finalize match' })).toBeNull();
  });

  it('names its rounds from the stage bracket once it is loaded', async () => {
    await renderConsole({
      fetchMatchConsole: async () => halfDecided,
      fetchSeeding: async () => ({
        stageId: 'stage-1',
        format: 'single-elimination',
        seeds: [],
        hasRecordedResults: false,
        zones: [
          {
            matches: [
              {
                matchId: 'SE-R1-M1',
                bracket: 'winners' as const,
                status: 'scheduled' as const,
                round: 1,
                position: 1,
                slots: [],
              },
              {
                matchId: 'SE-R1-M2',
                bracket: 'winners' as const,
                status: 'scheduled' as const,
                round: 1,
                position: 2,
                slots: [],
              },
              {
                matchId: 'SE-R2-M1',
                persistedMatchId: 'match-1',
                bracket: 'winners' as const,
                status: 'scheduled' as const,
                round: 2,
                position: 1,
                slots: [],
              },
            ],
          },
        ],
      }),
    });

    await waitFor(() => expect(screen.getByText('Awaiting Winner of Semi-final 2')).toBeDefined());
    expect(screen.queryByText(/Semi-final 1/)).toBeNull();
  });

  it('shows its controls once a live resolution decides the last side', async () => {
    const originalFetch = globalThis.fetch;
    const frame = (projectionVersion: number) =>
      `data: ${JSON.stringify({
        eventId: `resolved-${projectionVersion}`,
        organizationId: 'organization-1',
        stream: 'match:match-1',
        entityId: 'match-1',
        eventType: 'fixture.entrant-resolved',
        projectionVersion,
        createdAt: '2026-08-03T20:00:00.000Z',
        payload: { matchId: 'match-1', side: 'away', entrantId: 'entrant-b' },
      })}\n\n`;
    globalThis.fetch = (async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(frame(1) + frame(1)));
          },
        }),
      )) as typeof fetch;
    let loads = 0;
    try {
      await renderConsole({
        fetchMatchConsole: async () => (++loads === 1 ? halfDecided : decided),
        matchConsoleStream: () => ({ url: 'https://events.test/control/liga' }),
      });

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Finalize match' })).toBeDefined(),
      );
      expect(screen.queryByText(/^Awaiting /)).toBeNull();
      expect(loads).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('words a replayed action refused for an undecided side as the awaiting state', async () => {
    let loads = 0;
    await renderConsole({
      fetchMatchConsole: async () => (++loads === 1 ? projection : halfDecided),
      recordMatchEvent: async () => {
        throw new ControlApiError(409, 'Match side is undecided', 'match-side-undecided');
      },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Gol' }));
    });

    await waitFor(() =>
      expect(screen.getAllByText('Awaiting Winner of Round 1, match 2')).toHaveLength(2),
    );
    expect(
      screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('Awaiting Winner')),
    ).toBe(true);
  });
});
