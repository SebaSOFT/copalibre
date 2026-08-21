import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ScheduleBuilderRoute } from './components/ScheduleBuilderRoute.js';
import { ControlApiError } from './lib/api-client.js';
import type {
  ControlApiClient,
  FixtureResponse,
  OfficialResponse,
  ScheduleResponse,
  SchedulePreviewResponse,
  StageFixturesResponse,
  VenueResponse,
} from './lib/api-client.js';
import { withIntl } from './i18n/test-support.js';

const STAGE_ID = 'stage-1';

const oneFixture: readonly FixtureResponse[] = [
  { fixtureId: 'fixture-1', round: 1, homeEntrantId: 'entrant-a', awayEntrantId: 'entrant-b' },
];

const twoFixtures: readonly FixtureResponse[] = [
  ...oneFixture,
  { fixtureId: 'fixture-2', round: 1, homeEntrantId: 'entrant-c', awayEntrantId: 'entrant-d' },
];

const oneVenue: readonly VenueResponse[] = [
  {
    venueId: 'venue-1',
    organizationId: 'org-1',
    alias: 'cancha-1',
    name: 'Cancha 1',
    concurrentCapacity: 1,
  },
];

const oneOfficial: readonly OfficialResponse[] = [
  {
    officialId: 'official-1',
    organizationId: 'org-1',
    displayName: 'Ana Gómez',
    roles: ['referee'],
  },
];

describe('ScheduleBuilderRoute', () => {
  it('shows a fixture as unassigned until it has a start time', async () => {
    const client = stubClient({
      getStageFixtures: () => Promise.resolve({ stageId: STAGE_ID, fixtures: oneFixture }),
      getSchedule: () => Promise.resolve({ assignments: [] }),
    });
    render(
      withIntl(
        <ScheduleBuilderRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    const unassigned = await screen.findAllByText('Unassigned');
    expect(unassigned.length).toBeGreaterThan(0);
  });

  it('shows an entrant with no assigned fixture as having no match scheduled', async () => {
    const client = stubClient({
      getStageFixtures: () => Promise.resolve({ stageId: STAGE_ID, fixtures: oneFixture }),
      getSchedule: () => Promise.resolve({ assignments: [] }),
    });
    render(
      withIntl(
        <ScheduleBuilderRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    const dayOff = await screen.findAllByText(/No match scheduled in this range/);
    // Both entrants of the one fixture: neither has a scheduled time yet.
    expect(dayOff).toHaveLength(2);
  });

  it('does not mark an entrant with an existing scheduled assignment as a day off', async () => {
    const client = stubClient({
      getStageFixtures: () => Promise.resolve({ stageId: STAGE_ID, fixtures: oneFixture }),
      getSchedule: () =>
        Promise.resolve({
          assignments: [
            {
              fixtureId: 'fixture-1',
              window: { startsAt: Date.UTC(2026, 7, 1, 14, 0), durationMinutes: 60 },
            },
          ],
        }),
    });
    render(
      withIntl(
        <ScheduleBuilderRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findAllByText(/Round 1/);
    expect(screen.queryByText(/No match scheduled in this range/)).toBeNull();
  });

  it('previews a conflict-free batch and enables publish', async () => {
    const previewSchedule = jest.fn<NonNullable<ControlApiClient['previewSchedule']>>(async () => ({
      committable: true,
      conflicts: [],
      affectedPublishedFixtures: [],
    }));
    const publishSchedule = jest.fn<NonNullable<ControlApiClient['publishSchedule']>>(async () => ({
      assignments: [],
    }));
    const client = stubClient({
      getStageFixtures: () => Promise.resolve({ stageId: STAGE_ID, fixtures: oneFixture }),
      getSchedule: () => Promise.resolve({ assignments: [] }),
      listVenues: () => Promise.resolve(oneVenue),
      listOfficials: () => Promise.resolve(oneOfficial),
      previewSchedule,
      publishSchedule,
    });
    render(
      withIntl(
        <ScheduleBuilderRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findAllByText(/Round 1/);
    fireEvent.change(screen.getByLabelText(/Start time — fixture-1/), {
      target: { value: '2026-08-01T14:00' },
    });
    fireEvent.change(screen.getByLabelText(/Duration \(minutes\) — fixture-1/), {
      target: { value: '60' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Preview'));
    });
    expect(previewSchedule).toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByText('Publish'));
    });
    expect(publishSchedule).toHaveBeenCalled();
    await screen.findByText('Schedule published.');
  });

  it('shows a conflict and leaves publish disabled', async () => {
    const client = stubClient({
      getStageFixtures: () => Promise.resolve({ stageId: STAGE_ID, fixtures: twoFixtures }),
      getSchedule: () => Promise.resolve({ assignments: [] }),
      previewSchedule: () =>
        Promise.resolve({
          committable: false,
          conflicts: [
            {
              kind: 'venue-double-booked',
              fixtureId: 'fixture-1',
              conflictsWithFixtureId: 'fixture-2',
              resourceId: 'venue-1',
              detail: 'Venue "venue-1" hosts 1 fixture(s) at once',
            },
          ],
          affectedPublishedFixtures: [],
        }),
    });
    render(
      withIntl(
        <ScheduleBuilderRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findAllByText(/Round 1/);
    fireEvent.change(screen.getByLabelText(/Start time — fixture-1/), {
      target: { value: '2026-08-01T14:00' },
    });
    fireEvent.change(screen.getByLabelText(/Duration \(minutes\) — fixture-1/), {
      target: { value: '60' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Preview'));
    });

    await screen.findByText('Venue "venue-1" hosts 1 fixture(s) at once');
    expect((screen.getByText('Publish') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a fixture touching a finalized match is refused and surfaced', async () => {
    const client = stubClient({
      getStageFixtures: () => Promise.resolve({ stageId: STAGE_ID, fixtures: oneFixture }),
      getSchedule: () => Promise.resolve({ assignments: [] }),
      previewSchedule: () =>
        Promise.resolve({
          committable: false,
          conflicts: [
            {
              kind: 'match-finalized',
              fixtureId: 'fixture-1',
              conflictsWithFixtureId: 'fixture-1',
              resourceId: 'fixture-1',
              detail: 'Fixture "fixture-1"\'s match has already been finalized',
            },
          ],
          affectedPublishedFixtures: [],
        }),
    });
    render(
      withIntl(
        <ScheduleBuilderRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findAllByText(/Round 1/);
    fireEvent.change(screen.getByLabelText(/Start time — fixture-1/), {
      target: { value: '2026-08-01T14:00' },
    });
    fireEvent.change(screen.getByLabelText(/Duration \(minutes\) — fixture-1/), {
      target: { value: '60' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Preview'));
    });

    await screen.findByText(/has already been finalized/);
    expect((screen.getByText('Publish') as HTMLButtonElement).disabled).toBe(true);
  });

  it('surfaces the server’s own refusal message on a failed publish', async () => {
    const client = stubClient({
      getStageFixtures: () => Promise.resolve({ stageId: STAGE_ID, fixtures: oneFixture }),
      getSchedule: () => Promise.resolve({ assignments: [] }),
      previewSchedule: () =>
        Promise.resolve({ committable: true, conflicts: [], affectedPublishedFixtures: [] }),
      publishSchedule: () => Promise.reject(new ControlApiError(400, 'El lote fue rechazado')),
    });
    render(
      withIntl(
        <ScheduleBuilderRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findAllByText(/Round 1/);
    fireEvent.change(screen.getByLabelText(/Start time — fixture-1/), {
      target: { value: '2026-08-01T14:00' },
    });
    fireEvent.change(screen.getByLabelText(/Duration \(minutes\) — fixture-1/), {
      target: { value: '60' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Preview'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Publish'));
    });

    await screen.findByText('El lote fue rechazado');
  });

  it('reports a load failure', async () => {
    const client = stubClient({
      getStageFixtures: () => Promise.reject(new Error('down')),
    });
    render(
      withIntl(
        <ScheduleBuilderRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findByText('Could not load this stage’s schedule.');
  });

  it('shows a stage with no fixtures yet', async () => {
    const client = stubClient({
      getStageFixtures: () => Promise.resolve({ stageId: STAGE_ID, fixtures: [] }),
      getSchedule: () => Promise.resolve({ assignments: [] }),
    });
    render(
      withIntl(
        <ScheduleBuilderRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findByText('This stage has no fixtures yet.');
  });
});

function stubClient(overrides: Partial<ControlApiClient>): ControlApiClient {
  return {
    listMyOrganizations: () => Promise.resolve([]),
    listDisciplines: () => Promise.resolve([]),
    createTournament: () => Promise.reject(new Error('not used')),
    listRegistrations: () => Promise.resolve([]),
    bulkReview: () => Promise.reject(new Error('not used')),
    reviewRegistration: () => Promise.reject(new Error('not used')),
    fetchStandings: () => Promise.reject(new Error('not used')),
    fetchTiebreakTrace: () => Promise.reject(new Error('not used')),
    fetchTableLayouts: () => Promise.resolve([]),
    fetchTableProjection: () => Promise.reject(new Error('not used')),
    fetchSeeding: () => Promise.reject(new Error('not used')),
    publishSeeding: () => Promise.reject(new Error('not used')),
    listOrganizationRoles: () => Promise.resolve([]),
    inviteOrganizationUser: () => Promise.reject(new Error('not used')),
    changeOrganizationRole: () => Promise.reject(new Error('not used')),
    deleteOrganizationRole: () => Promise.reject(new Error('not used')),
    listVenues: () => Promise.resolve([]),
    listOfficials: () => Promise.resolve([]),
    getStageFixtures: (): Promise<StageFixturesResponse> =>
      Promise.resolve({ stageId: STAGE_ID, fixtures: [] }),
    getSchedule: (): Promise<ScheduleResponse> => Promise.resolve({ assignments: [] }),
    previewSchedule: (): Promise<SchedulePreviewResponse> =>
      Promise.resolve({ committable: true, conflicts: [], affectedPublishedFixtures: [] }),
    publishSchedule: (): Promise<ScheduleResponse> => Promise.resolve({ assignments: [] }),
    ...overrides,
  };
}
