import { ToastProvider } from './components/ToastProvider.js';
import { jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { MatchConsolePage } from './components/pages/MatchConsolePage.js';
import { type MatchConsoleResponse } from './lib/api-client.js';
import { withIntl } from './i18n/test-support.js';
import { clearAll } from './lib/offline-queue.js';
import { client, projection } from './match-console-route.test-support.js';

beforeEach(async () => {
  await clearAll();
});

describe('MatchConsolePage event ledger', () => {
  const manyEvents = {
    ...projection,
    events: ['one', 'two', 'three', 'four', 'five'].map((name, index) => ({
      eventId: `event-${name}`,
      definitionCode: `goal-${name}`,
      segmentId: 'segment-1',
      sequence: index + 1,
      occurredAt: '2026-08-03T20:00:00.000Z',
      side: 'entrant-a',
    })),
  };

  it('shows only the most recent events when collapsed, and every one when expanded', async () => {
    await act(async () => {
      render(
        withIntl(
          <MatchConsolePage
            client={client({ fetchMatchConsole: async () => manyEvents })}
            matchId="match-1"
            organizationAlias="liga"
            tournamentAlias="apertura"
          />,
        ),
      );
    });

    // Collapsed by default: the three most recent, newest first — the event
    // just recorded is never the one collapsing hides.
    expect(screen.getByText(/goal-five/)).toBeDefined();
    expect(screen.getByText(/goal-four/)).toBeDefined();
    expect(screen.getByText(/goal-three/)).toBeDefined();
    expect(screen.queryByText(/goal-two/)).toBeNull();
    expect(screen.queryByText(/goal-one/)).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show full history' }));
    });

    expect(screen.getByText(/goal-one/)).toBeDefined();
    expect(screen.getByText(/goal-two/)).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    });
    expect(screen.queryByText(/goal-one/)).toBeNull();
  });
});

describe('MatchConsolePage', () => {
  it('names both entrants in the score header, never their raw identifiers', async () => {
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

    const scoreboard = screen.getByLabelText('Current scoreboard');
    expect(within(scoreboard).getByText('Club Atlético')).toBeDefined();
    expect(within(scoreboard).getByText('Deportivo Cuyo')).toBeDefined();
    expect(scoreboard.textContent).not.toContain('entrant-a');
    expect(scoreboard.textContent).not.toContain('entrant-b');
  });

  it('labels an entrant with no resolvable name rather than showing its id', async () => {
    const unnamed = {
      ...projection,
      entrants: [{ entrantId: 'entrant-a' }, { entrantId: 'entrant-b' }],
    };
    await act(async () => {
      render(
        withIntl(
          <MatchConsolePage
            client={client({ fetchMatchConsole: async () => unnamed })}
            matchId="match-1"
            organizationAlias="liga"
            tournamentAlias="apertura"
          />,
        ),
      );
    });

    const scoreboard = screen.getByLabelText('Current scoreboard');
    expect(within(scoreboard).getAllByText('Unnamed entrant')).toHaveLength(2);
    expect(scoreboard.textContent).not.toContain('entrant-a');
  });

  it('renders authoritative score and records the descriptor-selected final outcome', async () => {
    const requests: unknown[] = [];
    await act(async () => {
      render(
        withIntl(
          <MatchConsolePage
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

    expect(screen.getByLabelText('Current scoreboard').textContent).toContain('Club Atlético1');
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
    // The offline queue adds effects of its own that may call `Date.now()` incidentally
    // before the click even fires; a persistent value for the whole phase
    // is robust to that, where a single queued one-shot value is not.
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    await act(async () => {
      render(
        withIntl(
          <MatchConsolePage
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
          <MatchConsolePage
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
          <MatchConsolePage
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
          <MatchConsolePage
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
          <MatchConsolePage
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
          secondaryActorFields: [
            { field: 'assistedBy', label: { en: 'Assisted by', es: 'Asistido por' } },
          ],
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
          <MatchConsolePage
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

    // Named by the discipline's own label, never the payload key.
    fireEvent.click(screen.getByRole('button', { name: 'Assisted by' }));
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
          secondaryActorFields: [
            { field: 'assistedBy', label: { en: 'Assisted by', es: 'Asistido por' } },
          ],
        },
      ],
      eligiblePersonIds: ['person-scorer', 'person-assist'],
    };
    const requests: unknown[] = [];
    await act(async () => {
      render(
        withIntl(
          <MatchConsolePage
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
          <ToastProvider>
            <MatchConsolePage
              client={client({ fetchMatchConsole: async () => bilingualProjection })}
              matchId="match-1"
              organizationAlias="liga"
              tournamentAlias="apertura"
            />
          </ToastProvider>
        </IntlProvider>,
      );
    });

    expect(screen.getByRole('button', { name: 'Gol' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Goal' })).toBeNull();
  });

  it('renders no broadcast-stream telemetry panel at all', async () => {
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

    // The console operator records the match; stream health is a
    // broadcast-operator question this screen deliberately no longer answers.
    for (const label of ['Operational signal', 'Latency', 'Packet loss', 'Viewers', 'Uptime']) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.queryByText('Unavailable')).toBeNull();
  });

  it('attributes person-or-staff events to a fixture staff member', async () => {
    const requests: unknown[] = [];
    await act(async () => {
      render(
        withIntl(
          <MatchConsolePage
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
});
