import { jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { MatchConsoleRoute } from './components/MatchConsoleRoute.js';
import {
  ControlApiError,
  type MatchConsoleApiClient,
  type MatchConsoleResponse,
} from './lib/api-client.js';
import { withIntl } from './i18n/test-support.js';
import { clearAll, enqueue, listPending } from './lib/offline-queue.js';

beforeEach(async () => {
  await clearAll();
});

const projection: MatchConsoleResponse = {
  matchId: 'match-1',
  status: 'in-progress',
  result: null,
  liveScores: [
    { entrantId: 'entrant-a', score: 1, statistics: { goals: 1 } },
    { entrantId: 'entrant-b', score: 0, statistics: {} },
  ],
  segments: [
    {
      segmentId: 'segment-1',
      type: 'half',
      number: 1,
      state: 'active',
      elapsedSeconds: 120,
      durationSeconds: 2700,
    },
  ],
  runningTimers: [],
  events: [
    {
      eventId: 'event-1',
      definitionCode: 'goal',
      segmentId: 'segment-1',
      sequence: 1,
      occurredAt: '2026-08-03T20:00:00.000Z',
      side: 'entrant-a',
    },
  ],
  eventDefinitions: [
    {
      code: 'penalty-decision',
      label: 'Penal',
      category: 'neutral',
      permittedSegmentTypes: ['half'],
      actorRequirement: 'side',
      payloadSchema: { type: 'object' },
      display: {},
      secondaryActorFields: [],
      workflow: {
        kind: 'outcome-choice',
        options: [
          { definitionCode: 'penalty-goal', label: 'Gol' },
          { definitionCode: 'penalty-missed', label: 'Fallado' },
        ],
      },
    },
    {
      code: 'penalty-goal',
      label: 'Gol de penal',
      category: 'positive',
      permittedSegmentTypes: ['half'],
      actorRequirement: 'side',
      payloadSchema: { type: 'object', properties: { description: { type: 'string' } } },
      display: {},
      secondaryActorFields: [],
    },
    {
      code: 'penalty-missed',
      label: 'Penal fallado',
      category: 'negative',
      permittedSegmentTypes: ['half'],
      actorRequirement: 'side',
      payloadSchema: { type: 'object' },
      display: {},
      secondaryActorFields: [],
    },
    {
      code: 'goal',
      label: 'Gol',
      category: 'positive',
      permittedSegmentTypes: ['half'],
      actorRequirement: 'side',
      payloadSchema: { type: 'object' },
      display: {},
      secondaryActorFields: [],
    },
    {
      code: 'technical-warning',
      label: 'Advertencia técnica',
      category: 'negative',
      permittedSegmentTypes: ['half'],
      actorRequirement: 'person-or-staff',
      payloadSchema: { type: 'object' },
      display: {},
      secondaryActorFields: [],
    },
  ],
  eligiblePersonIds: [],
  rosters: [
    {
      entrantId: 'entrant-a',
      members: [{ personId: 'person-a1', name: 'Home One', onField: true }],
    },
    {
      entrantId: 'entrant-b',
      members: [{ personId: 'person-b1', name: 'Away One', onField: true }],
    },
  ],
  rosterRoles: [],
  eligibleStaffIds: ['staff-1'],
  entrantIds: ['entrant-a', 'entrant-b'],
  capabilities: ['match.record-event', 'match.control-clock', 'match.finalize'],
  projectionVersion: 1,
};

function client(overrides: Partial<MatchConsoleApiClient> = {}): MatchConsoleApiClient {
  return {
    fetchMatchConsole: async () => projection,
    fetchMatchRosters: async () => [],
    fetchRosterCandidates: async () => [],
    setMatchRoster: async () => projection,
    adjustMatchClock: async () => projection,
    resolveMatchTimer: async () => projection,
    recordMatchEvent: async () => ({
      eventId: 'event-2',
      definitionCode: 'penalty-goal',
      sequence: 2,
      notifications: [],
    }),
    finalizeMatch: async () => ({
      matchId: 'match-1',
      status: 'finalized',
      clockRunning: false,
      runningTimers: [],
    }),
    bulkLoadMatch: async () => ({ matchId: 'match-1', status: 'finalized', eventCount: 0 }),
    ...overrides,
  };
}

describe('MatchConsoleRoute', () => {
  it('renders authoritative score and records the descriptor-selected final outcome', async () => {
    const requests: unknown[] = [];
    await act(async () => {
      render(
        withIntl(
          <MatchConsoleRoute
            client={client({
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

    expect(screen.getByLabelText('Current scoreboard').textContent).toContain('ntrant-a1');
    fireEvent.click(screen.getByRole('button', { name: 'Penal' }));
    expect(screen.getByLabelText('Event outcome')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Event description'), {
      target: { value: 'Tiro al ángulo' },
    });
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Gol' })[1] as HTMLButtonElement);
    });

    await waitFor(() =>
      expect(requests).toEqual([
        {
          definitionCode: 'penalty-goal',
          segmentId: 'segment-1',
          occurredAt: expect.any(Number),
          side: 'entrant-a',
          payload: { description: 'Tiro al ángulo' },
        },
      ]),
    );
  });

  it('captures occurredAt at the initial button press, not the workflow confirm step', async () => {
    const requests: unknown[] = [];
    // `mockReturnValue` (not `mockReturnValueOnce`) for the "Penal" phase —
    // 0123 adds effects of its own that may call `Date.now()` incidentally
    // before the click even fires; a persistent value for the whole phase
    // is robust to that, where a single queued one-shot value is not.
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    await act(async () => {
      render(
        withIntl(
          <MatchConsoleRoute
            client={client({
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

    fireEvent.click(screen.getByRole('button', { name: 'Penal' }));
    fireEvent.change(screen.getByLabelText('Log note'), {
      target: { value: 'Revisado tras demora' },
    });
    // Time an operator spends typing before confirming must not move the
    // recorded instant — if it did, this second `Date.now()` value would leak
    // into the request.
    now.mockReturnValue(9_000);
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Gol' })[1] as HTMLButtonElement);
    });

    await waitFor(() => expect(requests).toEqual([expect.objectContaining({ occurredAt: 1_000 })]));
    now.mockRestore();
  });

  it('records a foul workflow outcome that takes no further action as an ordinary timeline entry', async () => {
    const foulProjection: MatchConsoleResponse = {
      ...projection,
      eventDefinitions: [
        {
          code: 'foul',
          label: 'Falta',
          category: 'neutral',
          permittedSegmentTypes: ['half'],
          actorRequirement: 'side',
          payloadSchema: { type: 'object' },
          display: {},
          secondaryActorFields: [],
          workflow: {
            kind: 'outcome-choice',
            options: [
              { definitionCode: 'foul-play-on', label: 'Ley de ventaja' },
              { definitionCode: 'free-kick-awarded', label: 'Tiro libre' },
            ],
          },
        },
        {
          code: 'foul-play-on',
          label: 'Falta (ley de ventaja)',
          category: 'neutral',
          permittedSegmentTypes: ['half'],
          actorRequirement: 'side',
          payloadSchema: { type: 'object' },
          display: {},
          secondaryActorFields: [],
        },
        {
          code: 'free-kick-awarded',
          label: 'Tiro libre otorgado',
          category: 'neutral',
          permittedSegmentTypes: ['half'],
          actorRequirement: 'side',
          payloadSchema: { type: 'object' },
          display: {},
          secondaryActorFields: [],
        },
      ],
    };
    const requests: unknown[] = [];
    await act(async () => {
      render(
        withIntl(
          <MatchConsoleRoute
            client={client({
              fetchMatchConsole: async () => foulProjection,
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

    fireEvent.click(screen.getByRole('button', { name: 'Falta' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ley de ventaja' }));
    });

    // "Play on" is itself a real, ordinary event definition — the preliminary
    // `foul` press is never submitted on its own, so the only way a foul with
    // no further action still becomes a timeline entry is for its outcome to
    // be a first-class recorded event, exactly like any other outcome.
    await waitFor(() =>
      expect(requests).toEqual([expect.objectContaining({ definitionCode: 'foul-play-on' })]),
    );
  });

  it('sends and clears the log note when recording an event', async () => {
    const requests: unknown[] = [];
    await act(async () => {
      render(
        withIntl(
          <MatchConsoleRoute
            client={client({
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

    fireEvent.change(screen.getByLabelText('Log note'), {
      target: { value: 'Confirmado por árbitro' },
    });
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Gol' })[0] as HTMLButtonElement);
    });

    await waitFor(() =>
      expect(requests).toEqual([expect.objectContaining({ notes: 'Confirmado por árbitro' })]),
    );
    expect((screen.getByLabelText('Log note') as HTMLTextAreaElement).value).toBe('');
  });

  it('shows the timecode badge for an event carrying segmentElapsedSeconds', async () => {
    const timedProjection: MatchConsoleResponse = {
      ...projection,
      events: [{ ...projection.events[0], segmentElapsedSeconds: 754 }],
    };
    await act(async () => {
      render(
        withIntl(
          <MatchConsoleRoute
            client={client({ fetchMatchConsole: async () => timedProjection })}
            matchId="match-1"
            organizationAlias="liga"
            tournamentAlias="apertura"
          />,
        ),
      );
    });

    expect(
      screen.getByText(
        (_text, element) =>
          element?.tagName === 'STRONG' && element.textContent === 'goal · half 1 · 12:34',
      ),
    ).toBeDefined();
  });

  it('omits the timecode badge for an event with no segmentElapsedSeconds', async () => {
    await act(async () => {
      render(
        withIntl(
          <MatchConsoleRoute
            client={client()}
            matchId="match-1"
            organizationAlias="liga"
            tournamentAlias="apertura"
          />,
        ),
      );
    });

    expect(
      screen.getByText(
        (_text, element) =>
          element?.tagName === 'STRONG' && element.textContent === 'goal · half 1',
      ),
    ).toBeDefined();
  });

  it('sends a secondary actor selection under its declared payload field', async () => {
    const projectionWithSecondaryField: MatchConsoleResponse = {
      ...projection,
      eventDefinitions: [
        {
          ...projection.eventDefinitions[3],
          secondaryActorFields: ['assistedBy'],
        },
      ],
      eligiblePersonIds: ['person-scorer', 'person-assist'],
      rosters: [
        {
          entrantId: 'entrant-a',
          members: [{ personId: 'person-scorer', name: 'Scorer', onField: true }],
        },
        {
          entrantId: 'entrant-b',
          members: [{ personId: 'person-assist', name: 'Assist', onField: true }],
        },
      ],
    };
    const requests: unknown[] = [];
    await act(async () => {
      render(
        withIntl(
          <MatchConsoleRoute
            client={client({
              fetchMatchConsole: async () => projectionWithSecondaryField,
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

    fireEvent.click(screen.getByRole('button', { name: 'assistedBy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Assist' }));
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Gol' })[0] as HTMLButtonElement);
    });

    await waitFor(() =>
      expect(requests).toEqual([
        expect.objectContaining({ payload: { assistedBy: 'person-assist' } }),
      ]),
    );
  });

  it('omits the secondary actor payload field when nothing is selected', async () => {
    const projectionWithSecondaryField: MatchConsoleResponse = {
      ...projection,
      eventDefinitions: [
        {
          ...projection.eventDefinitions[3],
          secondaryActorFields: ['assistedBy'],
        },
      ],
      eligiblePersonIds: ['person-scorer', 'person-assist'],
    };
    const requests: unknown[] = [];
    await act(async () => {
      render(
        withIntl(
          <MatchConsoleRoute
            client={client({
              fetchMatchConsole: async () => projectionWithSecondaryField,
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

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Gol' })[0] as HTMLButtonElement);
    });

    await waitFor(() =>
      expect(requests).toEqual([expect.not.objectContaining({ payload: expect.anything() })]),
    );
  });

  it("resolves a locale-map event label to the viewer's interface language", async () => {
    const bilingualProjection: MatchConsoleResponse = {
      ...projection,
      eventDefinitions: [
        {
          ...projection.eventDefinitions[3],
          label: { en: 'Goal', es: 'Gol' },
        },
      ],
    };
    await act(async () => {
      render(
        <IntlProvider defaultLocale="en" locale="es">
          <MatchConsoleRoute
            client={client({ fetchMatchConsole: async () => bilingualProjection })}
            matchId="match-1"
            organizationAlias="liga"
            tournamentAlias="apertura"
          />
        </IntlProvider>,
      );
    });

    expect(screen.getByRole('button', { name: 'Gol' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Goal' })).toBeNull();
  });

  it('labels telemetry as unavailable without numeric placeholders', async () => {
    await act(async () => {
      render(
        withIntl(
          <MatchConsoleRoute
            client={client()}
            matchId="match-1"
            organizationAlias="liga"
            tournamentAlias="apertura"
          />,
        ),
      );
    });

    expect(screen.getAllByText('Unavailable')).toHaveLength(4);
    expect(screen.queryByText('0 ms')).toBeNull();
  });

  it('attributes person-or-staff events to a fixture staff member', async () => {
    const requests: unknown[] = [];
    await act(async () => {
      render(
        withIntl(
          <MatchConsoleRoute
            client={client({
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

    expect((screen.getByLabelText('Event staff') as HTMLSelectElement).value).toBe('staff-1');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Advertencia técnica' }));
    });

    await waitFor(() =>
      expect(requests).toEqual([
        {
          definitionCode: 'technical-warning',
          segmentId: 'segment-1',
          occurredAt: expect.any(Number),
          side: 'entrant-a',
          personId: 'staff-1',
        },
      ]),
    );
  });

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
          <MatchConsoleRoute
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
          <MatchConsoleRoute
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
    // A lost response is a network-level failure, not a refusal — 0123's
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
          <MatchConsoleRoute
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

    fireEvent.change(screen.getByLabelText('Elapsed seconds'), { target: { value: '180' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Apply clock' }));
      fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'negative' }));

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
          <MatchConsoleRoute
            client={client({
              recordMatchEvent: async () => {
                // A real refusal (a `ControlApiError`, matching what the API
                // actually throws for a non-2xx response) — 0123 only queues
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
    await waitFor(() => expect(screen.getByText('Evento rechazado por servidor')).toBeDefined());
    expect((screen.getByLabelText('Elapsed seconds') as HTMLInputElement).disabled).toBe(false);
  });

  it('shows the authoritative-load failure before a projection exists', async () => {
    await act(async () => {
      render(
        withIntl(
          <MatchConsoleRoute
            client={client({ fetchMatchConsole: async () => Promise.reject(new Error('offline')) })}
            matchId="match-1"
            organizationAlias="liga"
            tournamentAlias="apertura"
          />,
        ),
      );
    });
    expect(screen.getByText('Could not load the match’s authoritative state.')).toBeDefined();
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
          <MatchConsoleRoute
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
          <MatchConsoleRoute
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
          <MatchConsoleRoute
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
          <MatchConsoleRoute
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
          <MatchConsoleRoute
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
            <MatchConsoleRoute
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
            <MatchConsoleRoute
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
        <MatchConsoleRoute
          client={client()}
          matchId="match-1"
          organizationAlias="liga"
          tournamentAlias="apertura"
        />,
      ),
    );
    await screen.findByText(/apertura/);

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
        <MatchConsoleRoute
          client={client({ fetchMatchConsole: async () => scheduledNoActivity })}
          matchId="match-1"
          organizationAlias="liga"
          tournamentAlias="apertura"
        />,
      ),
    );

    const link = await screen.findByText('Load match data');
    expect(link.getAttribute('href')).toBe(
      '/control/liga/tournaments/apertura/matches/match-1/load',
    );
  });

  it('toggles the roster-selection step open and closed, labeled by whether a roster already exists', async () => {
    const withRosterCapability = {
      ...projection,
      capabilities: [...projection.capabilities, 'match.select-roster' as const],
    };
    render(
      withIntl(
        <MatchConsoleRoute
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
        <MatchConsoleRoute
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

  describe('offline queue', () => {
    it('leaves a network-failed clock adjustment queued, not lost, with no error banner', async () => {
      await act(async () => {
        render(
          withIntl(
            <MatchConsoleRoute
              client={client({
                adjustMatchClock: async () => {
                  throw new TypeError('Failed to fetch');
                },
              })}
              matchId="match-1"
              organizationAlias="liga"
              tournamentAlias="apertura"
            />,
          ),
        );
      });

      fireEvent.click(screen.getByRole('button', { name: 'Apply clock' }));

      await waitFor(() => expect(screen.getByText('1 queued action')).toBeDefined());
      expect(screen.queryByRole('alert')).toBeNull();
      const pending = await listPending('match-1');
      expect(pending).toHaveLength(1);
      expect(pending[0]).toMatchObject({ status: 'pending', action: { kind: 'clock-adjust' } });
    });

    it('resumes draining a queue left over from a prior session on mount (refresh-survivability)', async () => {
      await enqueue(
        {
          kind: 'clock-adjust',
          organizationAlias: 'liga',
          tournamentAlias: 'apertura',
          matchId: 'match-1',
          request: { segmentId: 'segment-1', elapsedSeconds: 42, activate: true },
        },
        'leftover-key',
        1_000,
      );

      const adjustMatchClock = jest.fn<MatchConsoleApiClient['adjustMatchClock']>(
        async () => projection,
      );
      await act(async () => {
        render(
          withIntl(
            <MatchConsoleRoute
              client={client({ adjustMatchClock })}
              matchId="match-1"
              organizationAlias="liga"
              tournamentAlias="apertura"
            />,
          ),
        );
      });

      await waitFor(() =>
        expect(adjustMatchClock).toHaveBeenCalledWith(
          'liga',
          'apertura',
          'match-1',
          { segmentId: 'segment-1', elapsedSeconds: 42, activate: true },
          'leftover-key',
        ),
      );
      await waitFor(async () => expect(await listPending('match-1')).toHaveLength(0));
    });

    it('shows queued count and last-synced time, never fabricating a value before a real drain', async () => {
      await act(async () => {
        render(
          withIntl(
            <MatchConsoleRoute
              client={client()}
              matchId="match-1"
              organizationAlias="liga"
              tournamentAlias="apertura"
            />,
          ),
        );
      });

      expect(screen.getByText('No queued actions')).toBeDefined();
      expect(screen.getByText('Not yet synced')).toBeDefined();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Apply clock' }));
      });

      await waitFor(() => {
        expect(screen.getByText('No queued actions')).toBeDefined();
        expect(screen.queryByText('Not yet synced')).toBeNull();
        expect(screen.getByText(/^Last synced /)).toBeDefined();
      });
    });
  });
});
