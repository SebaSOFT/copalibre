import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MatchConsolePage } from './components/pages/MatchConsolePage.js';
import { type MatchConsoleApiClient, type MatchConsoleResponse } from './lib/api-client.js';
import { withIntl } from './i18n/test-support.js';
import { clearAll, listPending } from './lib/offline-queue.js';
import { FIRST_SEGMENT, client, projection } from './match-console-route.test-support.js';

beforeEach(async () => {
  await clearAll();
});

describe('MatchConsolePage clock commands', () => {
  /**
   * The console reconciles against whatever the server projection says after a
   * drain, so a stub that never moves would undo every optimistic patch. This
   * one applies the command the way the server does: only one segment runs.
   */
  function clockServer(): {
    readonly sent: unknown[];
    readonly overrides: Partial<MatchConsoleApiClient>;
  } {
    const sent: unknown[] = [];
    let state: MatchConsoleResponse = projection;
    const stateAfter = {
      start: 'active',
      resume: 'active',
      pause: 'pending',
      end: 'completed',
    } as const;
    return {
      sent,
      overrides: {
        fetchMatchConsole: async () => state,
        sendMatchCommand: async (_organization, _tournament, matchId, command, segmentId) => {
          sent.push({ matchId, command, segmentId });
          state = {
            ...state,
            segments: state.segments.map((segment) =>
              segment.segmentId === segmentId
                ? { ...segment, state: stateAfter[command] }
                : segment,
            ),
          };
          return {
            matchId,
            status: 'in-progress',
            clockRunning: stateAfter[command] === 'active',
            runningTimers: [],
          };
        },
      },
    };
  }

  it('pauses the selected segment through the durable queue, then resumes it', async () => {
    const { sent, overrides } = clockServer();
    await act(async () => {
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

    // A running segment offers Pause and End; Resume has nothing to resume, so it is not offered.
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    });

    await waitFor(() =>
      expect(sent).toEqual([{ matchId: 'match-1', command: 'pause', segmentId: 'segment-1' }]),
    );
    // A paused segment is what offers Resume and withdraws Pause.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Resume' })).toHaveProperty('disabled', false);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    });
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toEqual({ matchId: 'match-1', command: 'resume', segmentId: 'segment-1' });
  });

  it('ends the segment and then offers no further clock command for it', async () => {
    const { sent, overrides } = clockServer();
    await act(async () => {
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

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'End segment' }));
    });

    await waitFor(() =>
      expect(sent).toEqual([{ matchId: 'match-1', command: 'end', segmentId: 'segment-1' }]),
    );
    for (const name of ['Start segment', 'Resume', 'Pause', 'End segment']) {
      await waitFor(() => expect(screen.queryByRole('button', { name })).toBeNull());
    }
    // An ended half is offered only its reopening, which asks for a reason.
    expect(screen.getByRole('button', { name: 'Reopen segment…' })).toBeTruthy();
  });

  it('offers Start match on a scheduled match even while a segment is marked running', async () => {
    const scheduled: MatchConsoleResponse = {
      ...projection,
      status: 'scheduled',
      segments: [
        { ...FIRST_SEGMENT, segmentId: 'segment-1', state: 'active' },
        {
          ...FIRST_SEGMENT,
          segmentId: 'segment-2',
          number: 2,
          state: 'pending',
          elapsedSeconds: 0,
        },
      ],
    };
    await act(async () => {
      render(
        withIntl(
          <MatchConsolePage
            client={client({ fetchMatchConsole: async () => scheduled })}
            matchId="match-1"
            organizationAlias="liga"
            tournamentAlias="apertura"
          />,
        ),
      );
    });

    expect(screen.getByRole('button', { name: 'Start match' })).toBeTruthy();
  });

  it('starts a scheduled match from its first unplayed segment with the start command', async () => {
    const sent: unknown[] = [];
    const scheduled: MatchConsoleResponse = {
      ...projection,
      status: 'scheduled',
      segments: [
        { ...FIRST_SEGMENT, segmentId: 'segment-1', state: 'pending', elapsedSeconds: 0 },
        {
          ...FIRST_SEGMENT,
          segmentId: 'segment-2',
          number: 2,
          state: 'pending',
          elapsedSeconds: 0,
        },
      ],
    };
    await act(async () => {
      render(
        withIntl(
          <MatchConsolePage
            client={client({
              fetchMatchConsole: async () => scheduled,
              sendMatchCommand: async (_organization, _tournament, matchId, command, segmentId) => {
                sent.push({ command, segmentId });
                return { matchId, status: 'in-progress', clockRunning: true, runningTimers: [] };
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
      fireEvent.click(screen.getByRole('button', { name: 'Start match' }));
    });

    await waitFor(() => expect(sent).toEqual([{ command: 'start', segmentId: 'segment-1' }]));
  });

  it('queues a clock command durably, exactly as a recorded event is queued', async () => {
    await act(async () => {
      render(
        withIntl(
          <MatchConsolePage
            client={client({
              sendMatchCommand: async () => {
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

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    });

    await waitFor(async () => expect(await listPending('match-1')).toHaveLength(1));
    const [queued] = await listPending('match-1');
    expect(queued).toMatchObject({
      status: 'pending',
      action: { kind: 'clock-command', command: 'pause', segmentId: 'segment-1' },
    });
  });
});

describe('MatchConsolePage Add segment', () => {
  const inProgress: MatchConsoleResponse = {
    ...projection,
    segmentPlan: { addable: [{ type: 'extra-time', withinPlan: true }] },
  };

  it('sends a double tap as one addition, under one idempotency key', async () => {
    const keys: string[] = [];
    let release: () => void = () => undefined;
    await act(async () => {
      render(
        withIntl(
          <MatchConsolePage
            client={client({
              fetchMatchConsole: async () => inProgress,
              addMatchSegment: async (_organization, _tournament, matchId, _type, key) => {
                keys.push(key);
                await new Promise<void>((resolve) => {
                  release = resolve;
                });
                return { matchId, status: 'in-progress', clockRunning: true, runningTimers: [] };
              },
            })}
            matchId="match-1"
            organizationAlias="liga"
            tournamentAlias="apertura"
          />,
        ),
      );
    });

    const add = screen.getByRole('button', { name: 'Add segment' });
    await act(async () => {
      fireEvent.click(add);
      fireEvent.click(add);
    });
    await waitFor(() => expect(keys.length).toBeGreaterThan(0));
    await act(async () => {
      release();
    });
    await waitFor(() => expect(add).toHaveProperty('disabled', false));
    // However many sends the queue makes, they carry one key: the server creates one segment.
    expect(new Set(keys).size).toBe(1);
  });

  it('repeats the idempotency key for a tap on the projection the console already sent from', async () => {
    const keys: string[] = [];
    await act(async () => {
      render(
        withIntl(
          <MatchConsolePage
            client={client({
              fetchMatchConsole: async () => inProgress,
              addMatchSegment: async (_organization, _tournament, matchId, _type, key) => {
                keys.push(key);
                return { matchId, status: 'in-progress', clockRunning: true, runningTimers: [] };
              },
            })}
            matchId="match-1"
            organizationAlias="liga"
            tournamentAlias="apertura"
          />,
        ),
      );
    });

    const add = screen.getByRole('button', { name: 'Add segment' });
    await act(async () => {
      fireEvent.click(add);
    });
    await waitFor(() => expect(keys).toHaveLength(1));
    await waitFor(() => expect(add).toHaveProperty('disabled', false));
    await act(async () => {
      fireEvent.click(add);
    });
    await waitFor(() => expect(keys).toHaveLength(2));
    // The server answers the repeat from its idempotency record: one segment, not two.
    expect(keys[1]).toBe(keys[0]);
  });
});

describe('MatchConsolePage time correction', () => {
  const correctButton = (): HTMLButtonElement =>
    screen.getByRole('button', { name: 'Correct' }) as HTMLButtonElement;
  const timeInput = (): HTMLInputElement =>
    screen.getByLabelText('Time (mm:ss)') as HTMLInputElement;
  const twoSegments: MatchConsoleResponse = {
    ...projection,
    segments: [
      FIRST_SEGMENT,
      { ...FIRST_SEGMENT, segmentId: 'segment-2', number: 2, state: 'pending', elapsedSeconds: 0 },
    ],
  };

  /** Renders the console against a server that keeps the time Correct sent, and nothing else. */
  async function renderConsole(shown: MatchConsoleResponse, sent: unknown[] = []): Promise<void> {
    let current = shown;
    await act(async () => {
      render(
        withIntl(
          <MatchConsolePage
            client={client({
              fetchMatchConsole: async () => current,
              adjustMatchClock: async (_organization, _tournament, _matchId, request) => {
                sent.push(request);
                current = {
                  ...current,
                  segments: current.segments.map((segment) =>
                    segment.segmentId === request.segmentId
                      ? { ...segment, elapsedSeconds: request.elapsedSeconds }
                      : segment,
                  ),
                };
                return current;
              },
            })}
            matchId="match-1"
            organizationAlias="liga"
            tournamentAlias="apertura"
          />,
        ),
      );
    });
  }

  it('shows the selected time as mm:ss and sends nothing until the operator types', async () => {
    const sent: unknown[] = [];
    await renderConsole(projection, sent);

    expect(timeInput().value).toBe('02:00');
    expect(correctButton().disabled).toBe(true);
    fireEvent.click(correctButton());
    await act(async () => undefined);
    expect(sent).toEqual([]);
  });

  it('sends a typed minutes:seconds time as seconds, without asking to activate the segment', async () => {
    const sent: unknown[] = [];
    await renderConsole(projection, sent);

    fireEvent.change(timeInput(), { target: { value: '20:50' } });
    expect(correctButton().disabled).toBe(false);
    await act(async () => {
      fireEvent.click(correctButton());
    });

    await waitFor(() => expect(sent).toEqual([{ segmentId: 'segment-1', elapsedSeconds: 1250 }]));
    await waitFor(() => expect(timeInput().value).toBe('20:50'));
    expect(correctButton().disabled).toBe(true);
    // The running segment keeps running: Correct never changes its state.
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  });

  it('sends whole minutes as seconds', async () => {
    const sent: unknown[] = [];
    await renderConsole(projection, sent);

    fireEvent.change(timeInput(), { target: { value: '45' } });
    await act(async () => {
      fireEvent.click(correctButton());
    });

    await waitFor(() => expect(sent).toEqual([{ segmentId: 'segment-1', elapsedSeconds: 2700 }]));
  });

  it.each(['', '-1', '1:60', '1.5', '20:5x'])(
    'keeps Correct unavailable for the input %j',
    async (typed) => {
      const sent: unknown[] = [];
      await renderConsole(projection, sent);

      fireEvent.change(timeInput(), { target: { value: typed } });
      expect(correctButton().disabled).toBe(true);
      fireEvent.click(correctButton());
      await act(async () => undefined);
      expect(sent).toEqual([]);
    },
  );

  it('discards a typed time when another segment is picked, and shows that segment’s time', async () => {
    await renderConsole(twoSegments);

    fireEvent.change(timeInput(), { target: { value: '15:00' } });
    fireEvent.change(screen.getByLabelText('Active segment'), { target: { value: 'segment-2' } });
    expect(timeInput().value).toBe('00:00');
    expect(correctButton().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Active segment'), { target: { value: 'segment-1' } });
    expect(timeInput().value).toBe('02:00');
    expect(correctButton().disabled).toBe(true);
  });

  it('shows no clock action and no time correction once the match is finalized', async () => {
    await renderConsole({ ...twoSegments, status: 'finalized' });

    for (const name of ['Pause', 'Resume', 'Start segment', 'Start match', 'Reopen segment…']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.queryByLabelText('Time (mm:ss)')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Correct' })).toBeNull();
  });
});

describe('MatchConsolePage reopen segment', () => {
  const ended: MatchConsoleResponse = {
    ...projection,
    segments: [
      { ...FIRST_SEGMENT, state: 'completed', elapsedSeconds: 2700 },
      { ...FIRST_SEGMENT, segmentId: 'segment-2', number: 2, state: 'pending', elapsedSeconds: 0 },
    ],
  };

  /** Renders the console against a server that keeps what Reopen segment sent. */
  async function renderConsole(sent: unknown[]): Promise<void> {
    let current = ended;
    await act(async () => {
      render(
        withIntl(
          <MatchConsolePage
            client={client({
              fetchMatchConsole: async () => current,
              reopenMatchSegment: async (
                _organization,
                _tournament,
                matchId,
                segmentId,
                reason,
              ) => {
                sent.push({ matchId, segmentId, reason });
                current = {
                  ...current,
                  segments: current.segments.map((segment) =>
                    segment.segmentId === segmentId ? { ...segment, state: 'pending' } : segment,
                  ),
                };
                return current;
              },
            })}
            matchId="match-1"
            organizationAlias="liga"
            tournamentAlias="apertura"
          />,
        ),
      );
    });
  }

  /** Renders the console, then picks the ended half, as an operator does: the default is the next unplayed one. */
  async function renderEndedHalfSelected(sent: unknown[]): Promise<void> {
    await renderConsole(sent);
    fireEvent.change(screen.getByLabelText('Active segment'), { target: { value: 'segment-1' } });
  }

  const reasonInput = (): HTMLInputElement => screen.getByLabelText('Reason') as HTMLInputElement;
  const confirmButton = (): HTMLButtonElement =>
    screen.getByRole('button', { name: 'Reopen segment' }) as HTMLButtonElement;

  it('asks for a reason before sending, and sends nothing on cancel or with an empty reason', async () => {
    const sent: unknown[] = [];
    await renderEndedHalfSelected(sent);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reopen segment…' }));
    });
    expect(confirmButton().disabled).toBe(true);
    fireEvent.change(reasonInput(), { target: { value: '   ' } });
    expect(confirmButton().disabled).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    expect(screen.queryByLabelText('Reason')).toBeNull();
    await act(async () => undefined);
    expect(sent).toEqual([]);
  });

  it('sends the reopen with the reason on confirm, and the segment then shows as paused', async () => {
    const sent: unknown[] = [];
    await renderEndedHalfSelected(sent);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reopen segment…' }));
    });
    fireEvent.change(reasonInput(), { target: { value: 'Ended by mistake' } });
    await act(async () => {
      fireEvent.click(confirmButton());
    });

    await waitFor(() =>
      expect(sent).toEqual([
        { matchId: 'match-1', segmentId: 'segment-1', reason: 'Ended by mistake' },
      ]),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy());
    expect(screen.getByRole('button', { name: 'End segment' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reopen segment…' })).toBeNull();
  });
  it('closes an open reopen confirmation when the selection moves, and reopens nothing', async () => {
    const sent: unknown[] = [];
    await renderEndedHalfSelected(sent);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reopen segment…' }));
    });
    fireEvent.change(reasonInput(), { target: { value: 'Ended by mistake' } });
    fireEvent.change(screen.getByLabelText('Active segment'), { target: { value: 'segment-2' } });
    expect(screen.queryByLabelText('Reason')).toBeNull();

    fireEvent.change(screen.getByLabelText('Active segment'), { target: { value: 'segment-1' } });
    expect(screen.queryByLabelText('Reason')).toBeNull();
    await act(async () => undefined);
    expect(sent).toEqual([]);
  });

  it('closes an open reopen confirmation when the time is corrected, and reopens nothing', async () => {
    const sent: unknown[] = [];
    await renderEndedHalfSelected(sent);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reopen segment…' }));
    });
    fireEvent.change(reasonInput(), { target: { value: 'Ended by mistake' } });
    fireEvent.change(screen.getByLabelText('Time (mm:ss)'), { target: { value: '20:50' } });
    const correctButton = screen.getByRole('button', { name: 'Correct' });
    await act(async () => {
      fireEvent.click(correctButton);
    });

    await waitFor(() => expect(screen.queryByLabelText('Reason')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Reopen segment' })).toBeNull();
    expect(sent).toEqual([]);
  });

  it('refuses a reason over the server limit, and a whitespace-only reason', async () => {
    const sent: unknown[] = [];
    await renderEndedHalfSelected(sent);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reopen segment…' }));
    });
    expect(reasonInput().maxLength).toBe(500);
    fireEvent.change(reasonInput(), { target: { value: 'x'.repeat(501) } });
    expect(confirmButton().disabled).toBe(true);
    fireEvent.change(reasonInput(), { target: { value: `  ${'x'.repeat(500)}  ` } });
    expect(confirmButton().disabled).toBe(false);
    fireEvent.change(reasonInput(), { target: { value: ' \t ' } });
    expect(confirmButton().disabled).toBe(true);
  });
});
