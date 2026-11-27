import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MatchConsolePage } from './components/pages/MatchConsolePage.js';
import { ControlApiError, type MatchConsoleResponse } from './lib/api-client.js';
import { withIntl } from './i18n/test-support.js';
import { clearAll } from './lib/offline-queue.js';
import { client, projection } from './match-console-route.test-support.js';

beforeEach(async () => {
  await clearAll();
});

describe('MatchConsolePage', () => {
  it('uses one UUID idempotency key for a guarded finalization attempt', async () => {
    const calls: string[] = [];
    let complete:
      | ((response: {
          readonly matchId: string;
          readonly status: 'finalized';
          readonly clockRunning: false;
          readonly runningTimers: readonly [];
        }) => void)
      | undefined;
    const pending = new Promise<{
      readonly matchId: string;
      readonly status: 'finalized';
      readonly clockRunning: false;
      readonly runningTimers: readonly [];
    }>((resolve) => {
      complete = resolve;
    });

    await act(async () => {
      render(
        withIntl(
          <MatchConsolePage
            client={client({
              finalizeMatch: async (
                _organization,
                _tournament,
                _match,
                _request,
                idempotencyKey,
              ) => {
                calls.push(idempotencyKey);
                return pending;
              },
            })}
            matchId="match-1"
            organizationAlias="liga"
            tournamentAlias="apertura"
          />,
        ),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Finalize match' }));
    const confirm = screen.getByRole('button', { name: 'Confirm finalization' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    await act(async () => {
      complete?.({
        matchId: 'match-1',
        status: 'finalized',
        clockRunning: false,
        runningTimers: [],
      });
      await pending;
    });
  });

  it('reuses the idempotency key after a lost finalization response', async () => {
    const keys: string[] = [];
    await act(async () => {
      render(
        withIntl(
          <MatchConsolePage
            client={client({
              finalizeMatch: async (
                _organization,
                _tournament,
                _match,
                _request,
                idempotencyKey,
              ) => {
                keys.push(idempotencyKey);
                if (keys.length === 1) throw new Error('Conexión interrumpida');
                return {
                  matchId: 'match-1',
                  status: 'finalized',
                  clockRunning: false,
                  runningTimers: [],
                };
              },
            })}
            matchId="match-1"
            organizationAlias="liga"
            tournamentAlias="apertura"
          />,
        ),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Finalize match' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm finalization' }));
    });
    // A lost response is a network-level failure, not a refusal — the
    // queue leaves it queued silently (no error banner) rather than
    // reporting a failure the operator would otherwise wrongly read as
    // "nothing happened, try something else." The retry below is exactly
    // that silent-requeue path: the same key, reused, now getting through.
    await waitFor(() => expect(keys).toHaveLength(1));
    expect(screen.queryByText('Conexión interrumpida')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm finalization' }));
    });

    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).toBe(keys[0]);
  });

  it('adjusts the selected clock, resolves an authorized timer, and filters the ledger', async () => {
    const requests: string[] = [];
    const withTimer: MatchConsoleResponse = {
      ...projection,
      runningTimers: [
        {
          timerId: 'timer-1',
          side: 'entrant-a',
          startedAt: Date.now(),
          durationSeconds: 120,
          remainingSeconds: 90,
        },
      ],
      capabilities: ['match.control-clock', 'match.resolve-timer'],
    };
    await act(async () => {
      render(
        withIntl(
          <MatchConsolePage
            client={client({
              fetchMatchConsole: async () => withTimer,
              adjustMatchClock: async () => {
                requests.push('clock');
                return withTimer;
              },
              resolveMatchTimer: async () => {
                requests.push('timer');
                return withTimer;
              },
            })}
            matchId="match-1"
            organizationAlias="liga"
            tournamentAlias="apertura"
          />,
        ),
      );
    });

    fireEvent.change(screen.getByLabelText('Time (mm:ss)'), { target: { value: '03:00' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Correct' }));
      fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Negative' }));

    await waitFor(() => expect(requests).toEqual(['clock', 'timer']));
    expect(screen.queryByText('goal · half 1')).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Finalize match' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('shows a server rejection while retaining granted clock controls', async () => {
    await act(async () => {
      render(
        withIntl(
          <MatchConsolePage
            client={client({
              recordMatchEvent: async () => {
                // A real refusal (a `ControlApiError`, matching what the API
                // actually throws for a non-2xx response) — the offline queue only queues
                // silently, with no error banner, for a network-level
                // failure, which a plain thrown `Error` would now simulate
                // instead.
                throw new ControlApiError(400, 'Evento rechazado por servidor');
              },
            })}
            matchId="match-1"
            organizationAlias="liga"
            tournamentAlias="apertura"
          />,
        ),
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Gol' }));
    });
    await waitFor(() =>
      expect(screen.getAllByText('Evento rechazado por servidor').length).toBeGreaterThan(0),
    );
    expect((screen.getByLabelText('Time (mm:ss)') as HTMLInputElement).disabled).toBe(false);
  });

  it('shows the authoritative-load failure before a projection exists', async () => {
    await act(async () => {
      render(
        withIntl(
          <MatchConsolePage
            client={client({ fetchMatchConsole: async () => Promise.reject(new Error('offline')) })}
            matchId="match-1"
            organizationAlias="liga"
            tournamentAlias="apertura"
          />,
        ),
      );
    });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined();
    expect(document.querySelector('.cl-skeleton')).not.toBeNull();
  });

  it('withholds invalid palette entries when no active segment or eligible actor exists', async () => {
    const unavailable: MatchConsoleResponse = {
      ...projection,
      segments: [{ ...projection.segments[0], state: 'pending', durationSeconds: undefined }],
      eligibleStaffIds: [],
      eventDefinitions: [
        { ...projection.eventDefinitions[3], actorRequirement: 'person' },
        { ...projection.eventDefinitions[4], actorRequirement: 'person-or-staff' },
      ],
    };
    await act(async () => {
      render(
        withIntl(
          <MatchConsolePage
            client={client({ fetchMatchConsole: async () => unavailable })}
            matchId="match-1"
            organizationAlias="liga"
            tournamentAlias="apertura"
          />,
        ),
      );
    });
    expect(screen.queryByRole('button', { name: 'Gol' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Advertencia técnica' })).toBeNull();
  });

  it('attributes a person event and clears staff selection', async () => {
    const requests: unknown[] = [];
    const personProjection: MatchConsoleResponse = {
      ...projection,
      eligiblePersonIds: ['person-1'],
      rosters: [
        { entrantId: 'entrant-a', members: [{ personId: 'person-1', name: 'One', onField: true }] },
      ],
      eventDefinitions: [
        { ...projection.eventDefinitions[3], actorRequirement: 'person' },
        {
          ...projection.eventDefinitions[3],
          code: 'pause',
          label: 'Pausa',
          actorRequirement: 'none',
        },
      ],
    };
    await act(async () => {
      render(
        withIntl(
          <MatchConsolePage
            client={client({
              fetchMatchConsole: async () => personProjection,
              recordMatchEvent: async (_o, _t, _m, request) => {
                requests.push(request);
                return {
                  eventId: 'event-2',
                  definitionCode: request.definitionCode,
                  sequence: 2,
                  notifications: [],
                };
              },
            })}
            matchId="match-1"
            organizationAlias="liga"
            tournamentAlias="apertura"
          />,
        ),
      );
    });
    fireEvent.click(screen.getByRole('button', { name: 'One' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Gol' })));
    await waitFor(() =>
      expect(requests).toEqual([expect.objectContaining({ personId: 'person-1' })]),
    );
  });

  it('updates operator selectors, retains a ledger note, and cancels finalization', async () => {
    await act(async () => {
      render(
        withIntl(
          <MatchConsolePage
            client={client()}
            matchId="match-1"
            organizationAlias="liga"
            tournamentAlias="apertura"
          />,
        ),
      );
    });

    fireEvent.change(screen.getByLabelText('Active segment'), { target: { value: 'segment-1' } });
    fireEvent.change(screen.getByLabelText('Event staff'), { target: { value: 'staff-1' } });
    // A jersey click (primary actor selection) intentionally clears any staff
    // selection, mirroring the mutual exclusivity the removed dropdowns had —
    // so it must come after the staff change to assert its own effect below.
    fireEvent.click(screen.getByRole('button', { name: 'Away One' }));
    fireEvent.change(screen.getByLabelText('Log note'), {
      target: { value: 'Verificado por mesa' },
    });

    expect(screen.getByRole('button', { name: 'Away One' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect((screen.getByLabelText('Log note') as HTMLTextAreaElement).value).toBe(
      'Verificado por mesa',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Finalize match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Confirm finalization' })).toBeNull();
  });

  it('withholds person events without an eligible person and labels unmatched ledger segments', async () => {
    const unavailablePerson: MatchConsoleResponse = {
      ...projection,
      events: [{ ...projection.events[0], segmentId: 'removed-segment' }],
      eligiblePersonIds: [],
      eventDefinitions: [{ ...projection.eventDefinitions[3], actorRequirement: 'person' }],
    };
    await act(async () => {
      render(
        withIntl(
          <MatchConsolePage
            client={client({ fetchMatchConsole: async () => unavailablePerson })}
            matchId="match-1"
            organizationAlias="liga"
            tournamentAlias="apertura"
          />,
        ),
      );
    });

    expect(screen.queryByRole('button', { name: 'Gol' })).toBeNull();
    expect(screen.getByText('goal · Unknown segment')).toBeDefined();
  });

  it('does not offer finalization for a completed match and records descriptions only when supported', async () => {
    const requests: unknown[] = [];
    const completed: MatchConsoleResponse = {
      ...projection,
      status: 'finalized',
      eventDefinitions: [{ ...projection.eventDefinitions[3], payloadSchema: { type: 'object' } }],
    };
    await act(async () => {
      render(
        withIntl(
          <MatchConsolePage
            client={client({
              fetchMatchConsole: async () => completed,
              recordMatchEvent: async (_organization, _tournament, _match, request) => {
                requests.push(request);
                return {
                  eventId: 'event-2',
                  definitionCode: request.definitionCode,
                  sequence: 2,
                  notifications: [],
                };
              },
            })}
            matchId="match-1"
            organizationAlias="liga"
            tournamentAlias="apertura"
          />,
        ),
      );
    });

    fireEvent.change(screen.getByLabelText('Event description'), {
      target: { value: 'Sin campo de descripción' },
    });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Gol' })));

    await waitFor(() =>
      expect(requests).toEqual([expect.not.objectContaining({ payload: expect.anything() })]),
    );
    expect(
      (screen.getByRole('button', { name: 'Finalize match' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('marks the projection stale when its authenticated stream fails', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('', { status: 403 })) as typeof fetch;
    try {
      await act(async () => {
        render(
          withIntl(
            <MatchConsolePage
              client={client({
                matchConsoleStream: () => ({ url: 'https://events.test/control/liga' }),
              })}
              matchId="match-1"
              organizationAlias="liga"
              tournamentAlias="apertura"
            />,
          ),
        );
        await Promise.resolve();
      });
      expect(screen.getByText('Awaiting authoritative projection...')).toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('reloads only for newer projections of its own match from the authenticated stream', async () => {
    const originalFetch = globalThis.fetch;
    const replayExpiredFrame = `event: replay.expired\ndata: ${JSON.stringify({
      reason: 'cursor expired',
    })}\n\n`;
    const frames = [
      { eventType: 'standings.recalculated', entityId: 'match-1', projectionVersion: 2 },
      { eventType: 'match.console-projection', entityId: 'other-match', projectionVersion: 2 },
      { eventType: 'match.console-projection', entityId: 'match-1', projectionVersion: 1 },
      { eventType: 'match.console-projection', entityId: 'match-1', projectionVersion: 2 },
    ]
      .map(
        (event, index) =>
          `data: ${JSON.stringify({
            eventId: `event-${index}`,
            organizationId: 'organization-1',
            stream: 'control',
            createdAt: '2026-08-03T20:00:00.000Z',
            payload: {},
            ...event,
          })}\n\n`,
      )
      .join('');
    let loads = 0;
    globalThis.fetch = (async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(replayExpiredFrame + frames));
          },
        }),
      )) as typeof fetch;
    try {
      await act(async () => {
        render(
          withIntl(
            <MatchConsolePage
              client={client({
                fetchMatchConsole: async () => {
                  loads += 1;
                  return projection;
                },
                matchConsoleStream: () => ({ url: 'https://events.test/control/liga' }),
              })}
              matchId="match-1"
              organizationAlias="liga"
              tournamentAlias="apertura"
            />,
          ),
        );
      });

      await waitFor(() => expect(loads).toBe(3));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('links to the load-match-data screen only for a scheduled match with no prior activity', async () => {
    render(
      withIntl(
        <MatchConsolePage
          client={client()}
          matchId="match-1"
          organizationAlias="liga"
          tournamentAlias="apertura"
        />,
      ),
    );
    await screen.findByRole('link', { name: 'Apertura 2026' });

    expect(screen.queryByText('Load match data')).toBeNull();
  });

  it('shows the load-match-data link for a scheduled match with no segments or events yet', async () => {
    const scheduledNoActivity = {
      ...projection,
      status: 'scheduled' as const,
      segments: [],
      events: [],
    };
    render(
      withIntl(
        <MatchConsolePage
          client={client({ fetchMatchConsole: async () => scheduledNoActivity })}
          matchId="match-1"
          organizationAlias="liga"
          tournamentAlias="apertura"
        />,
      ),
    );

    const link = await screen.findByRole('link', { name: 'Load match data' });
    expect(link.getAttribute('href')).toBe(
      '/control/liga/tournaments/apertura/matches/match-1/load',
    );
    expect(link.closest('nav')).toBeNull();
    expect(link.closest('.cl-page-header__actions')).not.toBeNull();
  });

  it('toggles the roster-selection step open and closed, labeled by whether a roster already exists', async () => {
    const withRosterCapability = {
      ...projection,
      capabilities: [...projection.capabilities, 'match.select-roster' as const],
    };
    render(
      withIntl(
        <MatchConsolePage
          client={client({ fetchMatchConsole: async () => withRosterCapability })}
          matchId="match-1"
          organizationAlias="liga"
          tournamentAlias="apertura"
        />,
      ),
    );

    // A roster already exists on this fixture, so the toggle reads "Edit roster".
    const toggle = await screen.findByRole('button', { name: 'Edit roster' });
    fireEvent.click(toggle);
    await screen.findByRole('region', { name: 'Roster selection' });
    expect(screen.getByRole('button', { name: 'Hide roster editor' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Hide roster editor' }));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Roster selection' })).toBeNull(),
    );
  });

  it('shows an explicit no-roster state with its own action when neither side has one yet', async () => {
    const noRosterYet = {
      ...projection,
      capabilities: [...projection.capabilities, 'match.select-roster' as const],
      rosters: [],
      eligiblePersonIds: [],
    };
    render(
      withIntl(
        <MatchConsolePage
          client={client({ fetchMatchConsole: async () => noRosterYet })}
          matchId="match-1"
          organizationAlias="liga"
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findByText('No roster selected for this match yet.');
    // Two "Select roster" entry points at this state: the header toggle and the alert's own action.
    const selectButtons = await screen.findAllByRole('button', { name: 'Select roster' });
    expect(selectButtons).toHaveLength(2);
    fireEvent.click(selectButtons.at(0) as HTMLElement);
    await screen.findByRole('region', { name: 'Roster selection' });
  });
});
