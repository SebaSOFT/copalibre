import { render, screen, waitFor } from '@testing-library/react';
import { ScheduleBuilderPage } from '../pages/ScheduleBuilderPage.js';
import { withIntl } from '../../i18n/test-support.js';
import type { ControlApiClient, FixtureSeriesResponse } from '../../lib/api-client.js';

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
    homeEntrantId: '0199b000-0000-7000-8000-000000000001',
    homeName: 'Godoy Cruz',
    awayEntrantId: '0199b000-0000-7000-8000-000000000002',
    awayName: 'Independiente Rivadavia',
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
            homeEntrantId: '0199b000-0000-7000-8000-000000000001',
            homeName: 'Godoy Cruz',
            awayEntrantId: '0199b000-0000-7000-8000-000000000002',
            awayName: 'Independiente Rivadavia',
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

describe('ScheduleBuilderPage', () => {
  it.each([false, true])(
    'never substitutes opaque ids for missing names (undecided: %s)',
    async (undecided) => {
      const { container } = render(
        withIntl(
          <ScheduleBuilderPage
            organizationAlias="liga-mendocina"
            tournamentAlias="apertura-2026"
            stageNumber={1}
            client={stubClient({
              getStageFixtures: async () => ({
                stageId: 'stage-1',
                fixtures: [
                  {
                    fixtureId: 'fixture-1',
                    matchId: 'match-1',
                    round: 1,
                    ...(undecided ? {} : { homeEntrantId: '0199b000-0000-7000-8000-000000000001' }),
                    awayEntrantId: '0199b000-0000-7000-8000-000000000002',
                    awayName: 'María López',
                    awayAbbreviation: 'ML',
                  },
                ],
              }),
            })}
          />,
        ),
      );
      await screen.findByLabelText('Start time — TBD vs María López');
      expect(screen.getAllByText('María López').length).toBeGreaterThan(0);
      expect(container.textContent).not.toMatch(/0199b000-/);
    },
  );

  it('renders a named home entrant and fully undecided future fixtures without exposing ids', async () => {
    const { container } = render(
      withIntl(
        <ScheduleBuilderPage
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
          stageNumber={1}
          client={stubClient({
            getStageFixtures: async () => ({
              stageId: 'stage-1',
              fixtures: [
                {
                  fixtureId: 'fixture-1',
                  matchId: 'match-1',
                  round: 1,
                  homeEntrantId: '0199b000-0000-7000-8000-000000000001',
                  homeName: 'Andrea Gómez',
                  homeAbbreviation: 'AG',
                  awayEntrantId: '0199b000-0000-7000-8000-000000000002',
                },
                { fixtureId: 'fixture-2', matchId: 'match-2', round: 2 },
              ],
            }),
          })}
        />,
      ),
    );
    await screen.findByLabelText('Start time — Andrea Gómez vs TBD');
    expect(screen.getByLabelText('Start time — TBD vs TBD')).toBeTruthy();
    expect(container.textContent).not.toMatch(/0199b000-/);
  });

  it('reports a conflict that arose after publication in words, moving nothing', async () => {
    const godoyCruz = '0199b000-0000-7000-8000-000000000001';
    const fixture = (fixtureId: string, matchId: string, round: number, away: string) => ({
      fixtureId,
      matchId,
      round,
      homeEntrantId: godoyCruz,
      homeName: 'Godoy Cruz',
      awayEntrantId: `0199b000-0000-7000-8000-00000000000${round + 1}`,
      awayName: away,
    });
    render(
      withIntl(
        <ScheduleBuilderPage
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
          stageNumber={1}
          client={stubClient({
            getStageFixtures: async () => ({
              stageId: 'stage-1',
              fixtures: [
                fixture('fixture-qf', 'match-qf', 1, 'Independiente Rivadavia'),
                fixture('fixture-sf', 'match-sf', 2, 'Gimnasia'),
              ],
            }),
            getSchedule: async () => ({
              assignments: [],
              conflicts: [
                {
                  kind: 'rest-rule',
                  matchId: 'match-sf',
                  conflictsWithMatchId: 'match-qf',
                  resourceId: godoyCruz,
                  detail: 'raw English detail',
                },
                {
                  kind: 'venue-double-booked',
                  matchId: 'match-sf',
                  conflictsWithMatchId: 'match-elsewhere',
                  resourceId: 'venue-1',
                  detail: 'raw English detail',
                },
              ],
            }),
          })}
        />,
      ),
    );

    const heading = await screen.findByText('Conflicts that arose after publication');
    const arisen = heading.closest('[data-arisen-conflicts]');
    expect(arisen?.getAttribute('role')).toBe('status');
    expect(
      screen.getByText(
        'Godoy Cruz lacks the required rest between Godoy Cruz vs Gimnasia and Godoy Cruz vs Independiente Rivadavia',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'The venue is over capacity for Godoy Cruz vs Gimnasia and a match outside this stage',
      ),
    ).toBeTruthy();
    expect(arisen?.textContent).not.toContain('raw English detail');
  });

  it('renders within ListScreenLayout structure and displays fixtures and calendar view', async () => {
    const { container } = render(
      withIntl(
        <ScheduleBuilderPage
          client={stubClient()}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByRole('heading', { level: 1, name: /schedule/i }));
    await screen.findAllByText(/Godoy Cruz/i);
    expect(container.querySelector('.cl-list-screen')).not.toBeNull();
    expect(container.querySelector('.cl-list-screen__header')).not.toBeNull();
    expect(container.querySelector('.cl-list-screen__listing')).not.toBeNull();
    expect(screen.getAllByText(/Godoy Cruz/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Independiente Rivadavia/i).length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/0199b000-/);
    expect(screen.getAllByTestId('entrant-name').length).toBeGreaterThan(0);
    expect(
      screen.getByLabelText('Start time — Godoy Cruz vs Independiente Rivadavia'),
    ).toBeTruthy();
  });

  it('links its breadcrumb back to the stage hub', async () => {
    render(
      withIntl(
        <ScheduleBuilderPage
          client={stubClient()}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByRole('heading', { level: 1, name: /schedule/i }));
    await screen.findAllByText(/Godoy Cruz/i);
    expect(screen.getByRole('link', { name: 'Stage 1' }).getAttribute('href')).toBe(
      '/control/liga-mendocina/tournaments/apertura-2026/stages/1',
    );
  });

  it('renders one row per game of a series, numbered in play order, grouped under one cross (2.1, 2.2)', async () => {
    render(
      withIntl(
        <ScheduleBuilderPage
          client={stubClient(seriesFixtures())}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByRole('heading', { level: 1, name: /schedule/i }));
    await screen.findAllByText(/Godoy Cruz/i);

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
        <ScheduleBuilderPage
          client={stubClient(seriesFixtures())}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByRole('heading', { level: 1, name: /schedule/i }));
    await screen.findAllByText(/Godoy Cruz/i);

    expect(screen.getAllByText(/Will be played/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Played only if the series is still undecided/i).length).toBe(4);
    // Nothing carries the state in a class name alone — the words are in the document, and
    // stripping every style leaves them there.
    expect(container.textContent).toContain('Played only if the series is still undecided');
  });

  it('keeps an anulled game in the view, naming the slot it had held (2.4)', async () => {
    render(
      withIntl(
        <ScheduleBuilderPage
          client={stubClient(decidedSeriesFixtures())}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByRole('heading', { level: 1, name: /schedule/i }));
    await screen.findAllByText(/Godoy Cruz/i);

    expect(screen.getAllByText(/No longer required/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Had held .*Estadio Malvinas/i).length).toBeGreaterThan(0);
    // The freed game offers no slot picker: the record says it was never played.
    expect(screen.queryByLabelText(/Game 4 of 5/i)).toBeNull();
  });

  it('lists the slots a pending series decision would free, before it is committed (2.5)', async () => {
    render(
      withIntl(
        <ScheduleBuilderPage
          client={stubClient(pendingDecisionFixtures())}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByRole('heading', { level: 1, name: /schedule/i }));
    await screen.findAllByText(/Godoy Cruz/i);

    expect(
      screen.getByRole('heading', { name: /Slots this series decision would free/i }),
    ).toBeDefined();
    expect(screen.getByText(/Game 4 — .*Estadio Malvinas/i)).toBeDefined();
  });
});
