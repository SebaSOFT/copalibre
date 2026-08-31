import { render, screen, waitFor } from '@testing-library/react';
import { ScheduleBuilderRoute } from './ScheduleBuilderRoute.js';
import { withIntl } from '../i18n/test-support.js';
import type { ControlApiClient, FixtureSeriesResponse } from '../lib/api-client.js';

const VENUE = {
  venueId: 'venue-1',
  alias: 'malvinas',
  name: 'Estadio Malvinas',
  concurrentCapacity: 2,
};

const SCHEDULE = {
  scheduleId: 'schedule-1',
  name: 'Playoff',
  slotMinutes: 90,
  slots: [
    { slotId: 'slot-4', venueId: 'venue-1', startsAt: '2026-08-04T19:00:00.000Z', matchCount: 0 },
    { slotId: 'slot-5', venueId: 'venue-1', startsAt: '2026-08-05T19:00:00.000Z', matchCount: 0 },
  ],
};

const SERIES: FixtureSeriesResponse = {
  span: 5,
  resolutionClass: 'best-of',
  guaranteedMatches: 3,
  matchesPlayed: 0,
  anulledMatchNumbers: [],
};

function seriesFixture(
  matches: readonly { number: number; status: string; releasedSlotId?: string }[],
  series: Partial<FixtureSeriesResponse> = {},
) {
  return {
    fixtureId: 'fixture-1',
    matchId: 'match-1',
    round: 1,
    homeEntrantId: 'Godoy Cruz',
    awayEntrantId: 'Independiente Rivadavia',
    matches: matches.map((match) => ({
      matchId: `match-${match.number}`,
      number: match.number,
      status: match.status,
      ...(match.releasedSlotId === undefined ? {} : { releasedSlotId: match.releasedSlotId }),
    })),
    series: { ...SERIES, ...series },
  };
}

/** An unstarted best-of-five: three certain games and two contingent ones. */
function seriesFixtures(): Partial<ControlApiClient> {
  return {
    getStageFixtures: () =>
      Promise.resolve({
        stageId: 'stage-1',
        fixtures: [
          seriesFixture([1, 2, 3, 4, 5].map((number) => ({ number, status: 'scheduled' }))),
        ],
      }),
    listVenues: () => Promise.resolve([VENUE]),
    listSchedules: () => Promise.resolve([SCHEDULE]),
  } as unknown as Partial<ControlApiClient>;
}

/** A best-of-five decided in three, its surplus games already anulled and their slots freed. */
function decidedSeriesFixtures(): Partial<ControlApiClient> {
  return {
    getStageFixtures: () =>
      Promise.resolve({
        stageId: 'stage-1',
        fixtures: [
          seriesFixture(
            [
              { number: 1, status: 'finalized' },
              { number: 2, status: 'finalized' },
              { number: 3, status: 'finalized' },
              { number: 4, status: 'not-required', releasedSlotId: 'slot-4' },
              { number: 5, status: 'not-required', releasedSlotId: 'slot-5' },
            ],
            { matchesPlayed: 3, anulledMatchNumbers: [4, 5], status: 'decided' },
          ),
        ],
      }),
    listVenues: () => Promise.resolve([VENUE]),
    listSchedules: () => Promise.resolve([SCHEDULE]),
  } as unknown as Partial<ControlApiClient>;
}

/** Decided, but the anulling not yet committed — the two surplus games still hold their slots. */
function pendingDecisionFixtures(): Partial<ControlApiClient> {
  return {
    getStageFixtures: () =>
      Promise.resolve({
        stageId: 'stage-1',
        fixtures: [
          seriesFixture(
            [
              { number: 1, status: 'finalized' },
              { number: 2, status: 'finalized' },
              { number: 3, status: 'finalized' },
              { number: 4, status: 'scheduled' },
              { number: 5, status: 'scheduled' },
            ],
            { matchesPlayed: 3, anulledMatchNumbers: [4, 5], status: 'decided' },
          ),
        ],
      }),
    getSchedule: () =>
      Promise.resolve({
        assignments: [
          {
            matchId: 'match-4',
            fixtureId: 'fixture-1',
            slotId: 'slot-4',
            venueId: 'venue-1',
            window: { startsAt: Date.UTC(2026, 7, 4, 19), durationMinutes: 90 },
          },
        ],
      }),
    listVenues: () => Promise.resolve([VENUE]),
    listSchedules: () => Promise.resolve([SCHEDULE]),
  } as unknown as Partial<ControlApiClient>;
}

function stubClient(overrides: Partial<ControlApiClient> = {}): ControlApiClient {
  return {
    getStageFixtures: () =>
      Promise.resolve({
        stageId: 'stage-1',
        fixtures: [
          {
            fixtureId: 'fixture-1',
            matchId: 'match-1',
            round: 1,
            homeEntrantId: 'Godoy Cruz',
            awayEntrantId: 'Independiente Rivadavia',
          },
        ],
      }),
    getSchedule: () =>
      Promise.resolve({
        assignments: [],
      }),
    listVenues: () => Promise.resolve([]),
    listOfficials: () => Promise.resolve([]),
    ...overrides,
  } as unknown as ControlApiClient;
}

describe('ScheduleBuilderRoute', () => {
  it('renders within ListScreenTemplate structure and displays fixtures and calendar view', async () => {
    const { container } = render(
      withIntl(
        <ScheduleBuilderRoute
          client={stubClient()}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByRole('heading', { level: 1, name: /schedule/i }));
    expect(container.querySelector('.cl-list-screen')).not.toBeNull();
    expect(container.querySelector('.cl-list-screen__header')).not.toBeNull();
    expect(container.querySelector('.cl-list-screen__listing')).not.toBeNull();
    expect(screen.getAllByText(/Godoy Cruz/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Independiente Rivadavia/i).length).toBeGreaterThan(0);
  });

  it('renders one row per game of a series, numbered in play order, grouped under one cross (2.1, 2.2)', async () => {
    render(
      withIntl(
        <ScheduleBuilderRoute
          client={stubClient(seriesFixtures())}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByRole('heading', { level: 1, name: /schedule/i }));

    // One group per cross, not one per game: five rows must read as one tie.
    expect(
      screen.getAllByRole('region', { name: /Godoy Cruz vs Independiente Rivadavia/i }),
    ).toHaveLength(2);
    for (const number of [1, 2, 3, 4, 5]) {
      expect(screen.getAllByText(new RegExp(`Game ${number} of 5`)).length).toBeGreaterThan(0);
    }
  });

  it('states each game’s contingency in words, so the distinction survives without color (2.3)', async () => {
    const { container } = render(
      withIntl(
        <ScheduleBuilderRoute
          client={stubClient(seriesFixtures())}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByRole('heading', { level: 1, name: /schedule/i }));

    expect(screen.getAllByText(/Will be played/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Played only if the series is still undecided/i).length).toBe(4);
    // Nothing carries the state in a class name alone — the words are in the document, and
    // stripping every style leaves them there.
    expect(container.textContent).toContain('Played only if the series is still undecided');
  });

  it('keeps an anulled game in the view, naming the slot it had held (2.4)', async () => {
    render(
      withIntl(
        <ScheduleBuilderRoute
          client={stubClient(decidedSeriesFixtures())}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByRole('heading', { level: 1, name: /schedule/i }));

    expect(screen.getAllByText(/No longer required/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Had held .*Estadio Malvinas/i).length).toBeGreaterThan(0);
    // The freed game offers no slot picker: the record says it was never played.
    expect(screen.queryByLabelText(/Game 4 of 5/i)).toBeNull();
  });

  it('lists the slots a pending series decision would free, before it is committed (2.5)', async () => {
    render(
      withIntl(
        <ScheduleBuilderRoute
          client={stubClient(pendingDecisionFixtures())}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByRole('heading', { level: 1, name: /schedule/i }));

    expect(
      screen.getByRole('heading', { name: /Slots this series decision would free/i }),
    ).toBeDefined();
    expect(screen.getByText(/Game 4 — .*Estadio Malvinas/i)).toBeDefined();
  });
});
