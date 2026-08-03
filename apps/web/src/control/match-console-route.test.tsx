import { act, fireEvent, render, screen } from '@testing-library/react';
import { MatchConsoleRoute } from './components/MatchConsoleRoute.js';
import type { MatchConsoleApiClient, MatchConsoleResponse } from './lib/api-client.js';

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
    },
    {
      code: 'penalty-missed',
      label: 'Penal fallado',
      category: 'negative',
      permittedSegmentTypes: ['half'],
      actorRequirement: 'side',
      payloadSchema: { type: 'object' },
      display: {},
    },
    {
      code: 'goal',
      label: 'Gol',
      category: 'positive',
      permittedSegmentTypes: ['half'],
      actorRequirement: 'side',
      payloadSchema: { type: 'object' },
      display: {},
    },
    {
      code: 'technical-warning',
      label: 'Advertencia técnica',
      category: 'negative',
      permittedSegmentTypes: ['half'],
      actorRequirement: 'person-or-staff',
      payloadSchema: { type: 'object' },
      display: {},
    },
  ],
  eligiblePersonIds: [],
  eligibleStaffIds: ['staff-1'],
  entrantIds: ['entrant-a', 'entrant-b'],
  capabilities: ['match.record-event', 'match.control-clock', 'match.finalize'],
  projectionVersion: 1,
};

function client(overrides: Partial<MatchConsoleApiClient> = {}): MatchConsoleApiClient {
  return {
    fetchMatchConsole: async () => projection,
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
    ...overrides,
  };
}

describe('MatchConsoleRoute', () => {
  it('renders authoritative score and records the descriptor-selected final outcome', async () => {
    const requests: unknown[] = [];
    await act(async () => {
      render(
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
      );
    });

    expect(screen.getByLabelText('Marcador actual').textContent).toContain('ntrant-a1');
    fireEvent.click(screen.getByRole('button', { name: 'Penal' }));
    expect(screen.getByLabelText('Resultado del evento')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Descripción del evento'), {
      target: { value: 'Tiro al ángulo' },
    });
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Gol' })[1] as HTMLButtonElement);
    });

    expect(requests).toEqual([
      {
        definitionCode: 'penalty-goal',
        segmentId: 'segment-1',
        occurredAt: expect.any(Number),
        side: 'entrant-a',
        payload: { description: 'Tiro al ángulo' },
      },
    ]);
  });

  it('labels telemetry as unavailable without numeric placeholders', async () => {
    await act(async () => {
      render(
        <MatchConsoleRoute
          client={client()}
          matchId="match-1"
          organizationAlias="liga"
          tournamentAlias="apertura"
        />,
      );
    });

    expect(screen.getAllByText('Unavailable')).toHaveLength(4);
    expect(screen.queryByText('0 ms')).toBeNull();
  });

  it('attributes person-or-staff events to a fixture staff member', async () => {
    const requests: unknown[] = [];
    await act(async () => {
      render(
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
      );
    });

    expect((screen.getByLabelText('Staff del evento') as HTMLSelectElement).value).toBe('staff-1');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Advertencia técnica' }));
    });

    expect(requests).toEqual([
      {
        definitionCode: 'technical-warning',
        segmentId: 'segment-1',
        occurredAt: expect.any(Number),
        side: 'entrant-a',
        personId: 'staff-1',
      },
    ]);
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
        <MatchConsoleRoute
          client={client({
            finalizeMatch: async (_organization, _tournament, _match, _request, idempotencyKey) => {
              calls.push(idempotencyKey);
              return pending;
            },
          })}
          matchId="match-1"
          organizationAlias="liga"
          tournamentAlias="apertura"
        />,
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Finalizar partido' }));
    const confirm = screen.getByRole('button', { name: 'Confirmar finalización' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(calls).toHaveLength(1);
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
        <MatchConsoleRoute
          client={client({
            finalizeMatch: async (_organization, _tournament, _match, _request, idempotencyKey) => {
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
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Finalizar partido' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar finalización' }));
    });
    expect(screen.getByText('Conexión interrumpida')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar finalización' }));
    });

    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });
});
