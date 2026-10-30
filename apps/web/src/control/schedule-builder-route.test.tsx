import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ScheduleBuilderPage } from './components/pages/ScheduleBuilderPage.js';
import { ControlApiError } from './lib/api-client.js';
import type {
  ControlApiClient,
  FixtureResponse,
  OfficialResponse,
  ScheduleDetailResponse,
  ScheduleResponse,
  SchedulePreviewResponse,
  StageFixturesResponse,
  VenueResponse,
} from './lib/api-client.js';
import { withIntl } from './i18n/test-support.js';

const STAGE_ID = 'stage-1';

const oneFixture: readonly FixtureResponse[] = [
  {
    fixtureId: 'fixture-1',
    matchId: 'match-1',
    round: 1,
    homeEntrantId: 'entrant-a',
    homeName: 'Club Alfa',
    awayEntrantId: 'entrant-b',
    awayName: 'Club Bravo',
  },
];

const twoFixtures: readonly FixtureResponse[] = [
  ...oneFixture,
  {
    fixtureId: 'fixture-2',
    matchId: 'match-2',
    round: 1,
    homeEntrantId: 'entrant-c',
    homeName: 'Club Cóndor',
    awayEntrantId: 'entrant-d',
    awayName: 'Club Delta',
  },
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

const oneSchedule: readonly ScheduleDetailResponse[] = [
  {
    scheduleId: 'schedule-1',
    organizationId: 'org-1',
    name: 'Schedule 1',
    startsAt: Date.UTC(2026, 7, 1, 14, 0),
    endsAt: Date.UTC(2026, 7, 1, 16, 0),
    slotMinutes: 60,
    turnaroundMinutes: 15,
    venueIds: ['venue-1'],
    slots: [
      {
        slotId: 'slot-1',
        scheduleId: 'schedule-1',
        venueId: 'venue-1',
        startsAt: Date.UTC(2026, 7, 1, 14, 0),
        matchCount: 0,
      },
    ],
  },
];

describe('ScheduleBuilderPage', () => {
  it('builds its own client when none is injected', async () => {
    render(
      withIntl(
        <ScheduleBuilderPage
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
  });

  it('shows a fixture as unassigned until it has a slot', async () => {
    const client = stubClient({
      getStageFixtures: () => Promise.resolve({ stageId: STAGE_ID, fixtures: oneFixture }),
      getSchedule: () => Promise.resolve({ assignments: [] }),
    });
    render(
      withIntl(
        <ScheduleBuilderPage
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
        <ScheduleBuilderPage
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    const dayOff = await screen.findAllByText(/No match scheduled in this range/);
    expect(dayOff).toHaveLength(2);
  });

  it('does not mark an entrant with an existing scheduled assignment as a day off', async () => {
    const client = stubClient({
      getStageFixtures: () => Promise.resolve({ stageId: STAGE_ID, fixtures: oneFixture }),
      listSchedules: () => Promise.resolve(oneSchedule),
      getSchedule: () =>
        Promise.resolve({
          assignments: [
            {
              matchId: 'match-1',
              fixtureId: 'fixture-1',
              slotId: 'slot-1',
              venueId: 'venue-1',
              window: { startsAt: Date.UTC(2026, 7, 1, 14, 0), durationMinutes: 60 },
            },
          ],
        }),
    });
    render(
      withIntl(
        <ScheduleBuilderPage
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findByLabelText(/Start time — Club Alfa vs Club Bravo/);
    expect(screen.queryByText(/No match scheduled in this range/)).toBeNull();
  });

  it('previews a conflict-free batch and enables publish', async () => {
    const previewSchedule = jest.fn<NonNullable<ControlApiClient['previewSchedule']>>(async () => ({
      committable: true,
      conflicts: [],
      affectedPublishedMatches: [],
    }));
    const publishSchedule = jest.fn<NonNullable<ControlApiClient['publishSchedule']>>(async () => ({
      assignments: [],
    }));
    const client = stubClient({
      getStageFixtures: () => Promise.resolve({ stageId: STAGE_ID, fixtures: oneFixture }),
      getSchedule: () => Promise.resolve({ assignments: [] }),
      listVenues: () => Promise.resolve(oneVenue),
      listOfficials: () => Promise.resolve(oneOfficial),
      listSchedules: () => Promise.resolve(oneSchedule),
      previewSchedule,
      publishSchedule,
    });
    render(
      withIntl(
        <ScheduleBuilderPage
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findByLabelText(/Start time — Club Alfa vs Club Bravo/);
    fireEvent.change(screen.getByLabelText(/Start time — Club Alfa vs Club Bravo/), {
      target: { value: 'slot-1' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Preview'));
    });
    expect(previewSchedule).toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByText('Publish schedule'));
    });
    expect(publishSchedule).toHaveBeenCalled();
    await screen.findByText('Schedule published.');
  });

  it('asks a reason before publishing a moved published match, and sends it', async () => {
    const twoSlots: readonly ScheduleDetailResponse[] = [
      {
        ...(oneSchedule[0] as ScheduleDetailResponse),
        slots: [
          ...(oneSchedule[0] as ScheduleDetailResponse).slots,
          {
            slotId: 'slot-2',
            scheduleId: 'schedule-1',
            venueId: 'venue-1',
            startsAt: Date.UTC(2026, 7, 1, 15, 15),
            matchCount: 0,
          },
        ],
      },
    ];
    const previewSchedule = jest.fn<NonNullable<ControlApiClient['previewSchedule']>>(async () => ({
      committable: true,
      conflicts: [],
      affectedPublishedMatches: ['match-1'],
      reasonRequiredMatches: ['match-1'],
    }));
    const publishSchedule = jest.fn<NonNullable<ControlApiClient['publishSchedule']>>(async () => ({
      assignments: [],
    }));
    const recentScheduleReasons = jest.fn<NonNullable<ControlApiClient['recentScheduleReasons']>>(
      async () => ({ reasons: ['Cancha 1 sin luz'] }),
    );
    const client = stubClient({
      getStageFixtures: () => Promise.resolve({ stageId: STAGE_ID, fixtures: oneFixture }),
      getSchedule: () =>
        Promise.resolve({
          assignments: [
            {
              matchId: 'match-1',
              fixtureId: 'fixture-1',
              slotId: 'slot-1',
              venueId: 'venue-1',
              window: { startsAt: Date.UTC(2026, 7, 1, 14, 0), durationMinutes: 60 },
            },
          ],
        }),
      listVenues: () => Promise.resolve(oneVenue),
      listSchedules: () => Promise.resolve(twoSlots),
      previewSchedule,
      publishSchedule,
      recentScheduleReasons,
    });
    render(
      withIntl(
        <ScheduleBuilderPage
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findByLabelText(/Start time — Club Alfa vs Club Bravo/);
    fireEvent.change(screen.getByLabelText(/Start time — Club Alfa vs Club Bravo/), {
      target: { value: 'slot-2' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Preview'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Publish schedule'));
    });

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Club Alfa vs Club Bravo');
    const publishChanges = screen.getByRole('button', { name: 'Publish changes' });
    expect(publishChanges).toHaveProperty('disabled', true);
    expect(recentScheduleReasons).toHaveBeenCalledWith('liga-mendocina');

    fireEvent.change(screen.getByLabelText('Reason for this batch'), {
      target: { value: 'Weather' },
    });
    expect(publishChanges).toHaveProperty('disabled', false);
    await act(async () => {
      fireEvent.click(publishChanges);
    });
    expect(publishSchedule).toHaveBeenCalledWith('liga-mendocina', 'apertura', STAGE_ID, {
      assignments: [{ matchId: 'match-1', slotId: 'slot-2' }],
      reason: { code: 'weather', text: 'Weather' },
    });
  });

  it('withdraws a placed match in the batch and lists the slot it frees', async () => {
    const previewSchedule = jest.fn<NonNullable<ControlApiClient['previewSchedule']>>(async () => ({
      committable: true,
      conflicts: [],
      affectedPublishedMatches: ['match-1'],
      reasonRequiredMatches: ['match-1'],
      withdrawn: ['match-1'],
      freedSlotIds: ['slot-1'],
    }));
    const client = stubClient({
      getStageFixtures: () => Promise.resolve({ stageId: STAGE_ID, fixtures: oneFixture }),
      getSchedule: () =>
        Promise.resolve({
          assignments: [
            {
              matchId: 'match-1',
              fixtureId: 'fixture-1',
              slotId: 'slot-1',
              venueId: 'venue-1',
              window: { startsAt: Date.UTC(2026, 7, 1, 14, 0), durationMinutes: 60 },
            },
          ],
        }),
      listVenues: () => Promise.resolve(oneVenue),
      listSchedules: () => Promise.resolve(oneSchedule),
      previewSchedule,
    });
    render(
      withIntl(
        <ScheduleBuilderPage
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    fireEvent.click(await screen.findByRole('button', { name: /Withdraw from slot/ }));
    expect(screen.getByText(/Withdrawn — it will have no scheduled time/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByText('Preview'));
    });
    expect(previewSchedule).toHaveBeenCalledWith('liga-mendocina', 'apertura', STAGE_ID, {
      assignments: [{ matchId: 'match-1', withdraw: true }],
    });
    expect(screen.getByText('Slots this batch frees')).toBeTruthy();
  });

  it('offers no move or withdrawal for a match in progress', async () => {
    const client = stubClient({
      getStageFixtures: () =>
        Promise.resolve({
          stageId: STAGE_ID,
          fixtures: [
            {
              ...(oneFixture[0] as FixtureResponse),
              matches: [{ matchId: 'match-1', number: 1, status: 'in-progress' }],
            },
          ],
        }),
      getSchedule: () =>
        Promise.resolve({
          assignments: [
            {
              matchId: 'match-1',
              fixtureId: 'fixture-1',
              slotId: 'slot-1',
              venueId: 'venue-1',
              window: { startsAt: Date.UTC(2026, 7, 1, 14, 0), durationMinutes: 60 },
            },
          ],
        }),
      listVenues: () => Promise.resolve(oneVenue),
      listSchedules: () => Promise.resolve(oneSchedule),
    });
    render(
      withIntl(
        <ScheduleBuilderPage
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findByText(/In progress — it cannot be moved or withdrawn/);
    expect(screen.queryByRole('button', { name: /Withdraw from slot/ })).toBeNull();
    expect(screen.queryByLabelText(/Start time — Club Alfa vs Club Bravo/)).toBeNull();
  });

  it('shows a conflict and leaves publish disabled', async () => {
    const client = stubClient({
      getStageFixtures: () => Promise.resolve({ stageId: STAGE_ID, fixtures: twoFixtures }),
      getSchedule: () => Promise.resolve({ assignments: [] }),
      listSchedules: () => Promise.resolve(oneSchedule),
      previewSchedule: () =>
        Promise.resolve({
          committable: false,
          conflicts: [
            {
              kind: 'venue-double-booked',
              matchId: 'match-1',
              conflictsWithMatchId: 'match-2',
              resourceId: 'venue-1',
              detail: 'Venue "venue-1" hosts 1 fixture(s) at once',
            },
          ],
          affectedPublishedMatches: [],
        }),
    });
    render(
      withIntl(
        <ScheduleBuilderPage
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findByLabelText(/Start time — Club Alfa vs Club Bravo/);
    fireEvent.change(screen.getByLabelText(/Start time — Club Alfa vs Club Bravo/), {
      target: { value: 'slot-1' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Preview'));
    });

    await screen.findByText(
      'The venue is over capacity for Club Alfa vs Club Bravo and Club Cóndor vs Club Delta',
    );
    // The API's English diagnostic, with its identifiers, is never shown.
    expect(screen.queryByText(/hosts 1 fixture/)).toBeNull();
    expect((screen.getByText('Publish schedule') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a fixture touching a finalized match is refused and surfaced', async () => {
    const client = stubClient({
      getStageFixtures: () => Promise.resolve({ stageId: STAGE_ID, fixtures: oneFixture }),
      getSchedule: () => Promise.resolve({ assignments: [] }),
      listSchedules: () => Promise.resolve(oneSchedule),
      previewSchedule: () =>
        Promise.resolve({
          committable: false,
          conflicts: [
            {
              kind: 'match-finalized',
              matchId: 'match-1',
              conflictsWithMatchId: 'match-1',
              resourceId: 'match-1',
              detail: 'Fixture "fixture-1"\'s match has already been finalized',
            },
          ],
          affectedPublishedMatches: [],
        }),
    });
    render(
      withIntl(
        <ScheduleBuilderPage
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findByLabelText(/Start time — Club Alfa vs Club Bravo/);
    fireEvent.change(screen.getByLabelText(/Start time — Club Alfa vs Club Bravo/), {
      target: { value: 'slot-1' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Preview'));
    });

    await screen.findByText(
      'Club Alfa vs Club Bravo is finalized: its schedule is a record and can no longer change',
    );
    expect(screen.queryByText(/fixture-1/)).toBeNull();
    expect((screen.getByText('Publish schedule') as HTMLButtonElement).disabled).toBe(true);
  });

  it('lists the conflicts of a refused publish in words, not the server’s message', async () => {
    const publishSchedule = jest.fn<NonNullable<ControlApiClient['publishSchedule']>>(() =>
      Promise.reject(
        new ControlApiError(
          400,
          'The schedule has 1 conflict(s): Entrant "entrant-a" …',
          'schedule-bad-request',
          [
            {
              kind: 'match-in-progress',
              matchId: 'match-1',
              conflictsWithMatchId: 'match-1',
              resourceId: 'match-1',
            },
          ],
        ),
      ),
    );
    const client = stubClient({
      getStageFixtures: () => Promise.resolve({ stageId: STAGE_ID, fixtures: oneFixture }),
      getSchedule: () => Promise.resolve({ assignments: [] }),
      listSchedules: () => Promise.resolve(oneSchedule),
      previewSchedule: () =>
        Promise.resolve({ committable: true, conflicts: [], affectedPublishedMatches: [] }),
      publishSchedule,
    });
    render(
      withIntl(
        <ScheduleBuilderPage
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findByLabelText(/Start time — Club Alfa vs Club Bravo/);
    fireEvent.change(screen.getByLabelText(/Start time — Club Alfa vs Club Bravo/), {
      target: { value: 'slot-1' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Preview'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Publish schedule'));
    });

    await screen.findByText('The schedule was not published: it now has conflicts, listed below.');
    expect(
      screen.getByText(
        'Club Alfa vs Club Bravo is being played: it cannot be moved or withdrawn now',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/entrant-a/)).toBeNull();
    expect((screen.getByText('Publish schedule') as HTMLButtonElement).disabled).toBe(true);
  });

  it('surfaces the server’s own refusal message on a failed publish', async () => {
    const client = stubClient({
      getStageFixtures: () => Promise.resolve({ stageId: STAGE_ID, fixtures: oneFixture }),
      getSchedule: () => Promise.resolve({ assignments: [] }),
      listSchedules: () => Promise.resolve(oneSchedule),
      previewSchedule: () =>
        Promise.resolve({ committable: true, conflicts: [], affectedPublishedMatches: [] }),
      publishSchedule: () => Promise.reject(new ControlApiError(400, 'El lote fue rechazado')),
    });
    render(
      withIntl(
        <ScheduleBuilderPage
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findByLabelText(/Start time — Club Alfa vs Club Bravo/);
    fireEvent.change(screen.getByLabelText(/Start time — Club Alfa vs Club Bravo/), {
      target: { value: 'slot-1' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Preview'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Publish schedule'));
    });

    await screen.findByText('El lote fue rechazado');
  });

  it('toggles an official on and off', async () => {
    const client = stubClient({
      getStageFixtures: () => Promise.resolve({ stageId: STAGE_ID, fixtures: oneFixture }),
      getSchedule: () => Promise.resolve({ assignments: [] }),
      listVenues: () => Promise.resolve(oneVenue),
      listOfficials: () => Promise.resolve(oneOfficial),
      listSchedules: () => Promise.resolve(oneSchedule),
    });
    render(
      withIntl(
        <ScheduleBuilderPage
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findByLabelText(/Start time — Club Alfa vs Club Bravo/);

    const officialCheckbox = screen.getByLabelText('Ana Gómez') as HTMLInputElement;
    fireEvent.click(officialCheckbox);
    expect(officialCheckbox.checked).toBe(true);
    fireEvent.click(officialCheckbox);
    expect(officialCheckbox.checked).toBe(false);
  });

  it('reports a generic failure when preview throws a non-ControlApiError', async () => {
    const client = stubClient({
      getStageFixtures: () => Promise.resolve({ stageId: STAGE_ID, fixtures: oneFixture }),
      getSchedule: () => Promise.resolve({ assignments: [] }),
      listSchedules: () => Promise.resolve(oneSchedule),
      previewSchedule: () => Promise.reject(new Error('network down')),
    });
    render(
      withIntl(
        <ScheduleBuilderPage
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findByLabelText(/Start time — Club Alfa vs Club Bravo/);
    fireEvent.change(screen.getByLabelText(/Start time — Club Alfa vs Club Bravo/), {
      target: { value: 'slot-1' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Preview'));
    });

    await screen.findByText('The request could not be completed. Try again.');
  });

  it('surfaces the server’s own refusal message on a failed preview', async () => {
    const client = stubClient({
      getStageFixtures: () => Promise.resolve({ stageId: STAGE_ID, fixtures: oneFixture }),
      getSchedule: () => Promise.resolve({ assignments: [] }),
      listSchedules: () => Promise.resolve(oneSchedule),
      previewSchedule: () => Promise.reject(new ControlApiError(400, 'El lote fue rechazado')),
    });
    render(
      withIntl(
        <ScheduleBuilderPage
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findByLabelText(/Start time — Club Alfa vs Club Bravo/);
    fireEvent.change(screen.getByLabelText(/Start time — Club Alfa vs Club Bravo/), {
      target: { value: 'slot-1' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Preview'));
    });

    await screen.findByText('El lote fue rechazado');
  });

  it('reports a generic failure when publish throws a non-ControlApiError', async () => {
    const client = stubClient({
      getStageFixtures: () => Promise.resolve({ stageId: STAGE_ID, fixtures: oneFixture }),
      getSchedule: () => Promise.resolve({ assignments: [] }),
      listSchedules: () => Promise.resolve(oneSchedule),
      previewSchedule: () =>
        Promise.resolve({ committable: true, conflicts: [], affectedPublishedMatches: [] }),
      publishSchedule: () => Promise.reject(new Error('network down')),
    });
    render(
      withIntl(
        <ScheduleBuilderPage
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findByLabelText(/Start time — Club Alfa vs Club Bravo/);
    fireEvent.change(screen.getByLabelText(/Start time — Club Alfa vs Club Bravo/), {
      target: { value: 'slot-1' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Preview'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Publish schedule'));
    });

    await screen.findByText('The request could not be completed. Try again.');
  });

  it('does nothing when preview and publish are clicked with an empty batch', async () => {
    const previewSchedule = jest.fn<NonNullable<ControlApiClient['previewSchedule']>>(async () => ({
      committable: true,
      conflicts: [],
      affectedPublishedMatches: [],
    }));
    const client = stubClient({
      getStageFixtures: () => Promise.resolve({ stageId: STAGE_ID, fixtures: oneFixture }),
      getSchedule: () => Promise.resolve({ assignments: [] }),
      previewSchedule,
    });
    render(
      withIntl(
        <ScheduleBuilderPage
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findByLabelText(/Start time — Club Alfa vs Club Bravo/);
    expect((screen.getByText('Preview') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText('Publish schedule') as HTMLButtonElement).disabled).toBe(true);
  });

  it('reports a load failure', async () => {
    const client = stubClient({
      getStageFixtures: () => Promise.reject(new Error('down')),
    });
    render(
      withIntl(
        <ScheduleBuilderPage
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findByRole('button', { name: 'Retry' });
  });

  it('reports a load failure when the client has no fixtures method at all', async () => {
    const client = stubClient({ getStageFixtures: undefined });
    render(
      withIntl(
        <ScheduleBuilderPage
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findByRole('button', { name: 'Retry' });
  });

  it('shows a stage with no fixtures yet', async () => {
    const client = stubClient({
      getStageFixtures: () => Promise.resolve({ stageId: STAGE_ID, fixtures: [] }),
      getSchedule: () => Promise.resolve({ assignments: [] }),
    });
    render(
      withIntl(
        <ScheduleBuilderPage
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
    listSchedules: () => Promise.resolve([]),
    getStageFixtures: (): Promise<StageFixturesResponse> =>
      Promise.resolve({ stageId: STAGE_ID, fixtures: [] }),
    getSchedule: (): Promise<ScheduleResponse> => Promise.resolve({ assignments: [] }),
    previewSchedule: (): Promise<SchedulePreviewResponse> =>
      Promise.resolve({ committable: true, conflicts: [], affectedPublishedMatches: [] }),
    publishSchedule: (): Promise<ScheduleResponse> => Promise.resolve({ assignments: [] }),
    ...overrides,
  };
}
