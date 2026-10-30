import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { withIntl } from '../../i18n/test-support.js';
import { ScheduleBuilderTemplate } from './ScheduleBuilderTemplate.js';

const scheduleId = '019927d0-0000-7000-8000-000000000010';
const organizationId = '019927d0-0000-7000-8000-000000000011';
const firstVenueId = '019927d0-0000-7000-8000-000000000012';
const secondVenueId = '019927d0-0000-7000-8000-000000000013';
const firstDay = Date.UTC(2026, 9, 29, 12);
const secondDay = Date.UTC(2026, 9, 30, 12);

const props = {
  affectedPublishedMatches: [],
  committable: false,
  conflicts: [],
  drafts: {
    'match-1': { slotId: 'slot-1', officialIds: [] },
    'match-2': { slotId: 'slot-2', officialIds: [] },
    'match-3': { slotId: 'slot-3', officialIds: [] },
    'match-4': { slotId: '', officialIds: [] },
  },
  fixtures: [
    {
      fixtureId: 'fixture-1',
      matchId: 'match-1',
      round: 1,
      homeEntrantId: 'club-a',
      homeName: 'Club A',
      awayEntrantId: 'club-b',
      awayName: 'Club B',
    },
    {
      fixtureId: 'fixture-2',
      matchId: 'match-2',
      round: 1,
      homeEntrantId: 'club-c',
      homeName: 'Club C',
      awayEntrantId: 'club-d',
      awayName: 'Club D',
    },
    {
      fixtureId: 'fixture-3',
      matchId: 'match-3',
      round: 2,
      homeEntrantId: 'club-e',
      homeName: 'Club E',
      awayEntrantId: 'club-f',
      awayName: 'Club F',
    },
    {
      fixtureId: 'fixture-4',
      matchId: 'match-4',
      round: 2,
      homeEntrantId: 'club-g',
      homeName: 'Club G',
      awayEntrantId: 'club-h',
      awayName: 'Club H',
    },
  ],
  officials: [],
  onPreview: () => undefined,
  onPublish: () => undefined,
  onSetDraft: () => undefined,
  onToggleOfficial: () => undefined,
  organizationAlias: 'liga-san-juan',
  organizationTimeZone: 'UTC',
  previewed: false,
  schedules: [
    {
      scheduleId,
      organizationId,
      name: 'Copa Premier',
      startsAt: firstDay,
      endsAt: secondDay + 3_600_000,
      slotMinutes: 60,
      turnaroundMinutes: 15,
      venueIds: [firstVenueId, secondVenueId],
      slots: [
        {
          slotId: 'slot-1',
          scheduleId,
          venueId: firstVenueId,
          startsAt: firstDay,
          matchCount: 0,
        },
        {
          slotId: 'slot-2',
          scheduleId,
          venueId: secondVenueId,
          startsAt: firstDay + 3_600_000,
          matchCount: 0,
        },
        {
          slotId: 'slot-3',
          scheduleId,
          venueId: firstVenueId,
          startsAt: secondDay,
          matchCount: 0,
        },
      ],
    },
  ],
  stageNumber: 1,
  tournamentAlias: 'copa-premier',
  venues: [
    {
      venueId: firstVenueId,
      organizationId,
      alias: 'cancha-central',
      name: 'Cancha Central',
      concurrentCapacity: 1,
    },
    {
      venueId: secondVenueId,
      organizationId,
      alias: 'cancha-norte',
      name: 'Cancha Norte',
      concurrentCapacity: 1,
    },
  ],
} satisfies ComponentProps<typeof ScheduleBuilderTemplate>;

function renderSchedule() {
  return render(withIntl(<ScheduleBuilderTemplate {...props} />));
}

describe('ScheduleBuilderTemplate', () => {
  it('groups matches chronologically by day and then venue, with one collapsible section per day', () => {
    const { container } = renderSchedule();

    expect(screen.getByRole('heading', { name: 'Schedule by day' })).toBeDefined();
    expect(screen.queryByText('Calendar view')).toBeNull();
    expect(screen.queryByText('List view')).toBeNull();

    const days = [...container.querySelectorAll('details')];
    expect(days).toHaveLength(3);
    expect(days[0]?.querySelector('summary')?.textContent).toContain('October 29');
    expect(days[1]?.querySelector('summary')?.textContent).toContain('October 30');
    expect(days[2]?.querySelector('summary')?.textContent).toBe('Unassigned');
    expect(days[0]?.open).toBe(true);
    expect(days[1]?.open).toBe(false);

    const venues = [...(days[0]?.querySelectorAll('section[aria-label]') ?? [])].map((section) =>
      section.getAttribute('aria-label'),
    );
    expect(venues).toEqual(['Cancha Central', 'Cancha Norte']);
    expect(screen.getAllByText('Club A vs Club B')).toHaveLength(1);

    fireEvent.click(days[0]?.querySelector('summary') as HTMLElement);
    expect(days[0]?.open).toBe(false);
  });

  it('filters by day and venue and explains when the combination has no matches', () => {
    renderSchedule();

    const dayFilter = screen.getByRole('combobox', { name: 'Day' }) as HTMLSelectElement;
    const venueFilter = screen.getByRole('combobox', { name: 'Venue' }) as HTMLSelectElement;
    const secondDayOption = [...dayFilter.options].find((option) =>
      option.textContent?.includes('October 30'),
    );
    expect(secondDayOption).toBeDefined();
    fireEvent.change(dayFilter, { target: { value: secondDayOption?.value } });
    fireEvent.change(venueFilter, { target: { value: secondVenueId } });

    expect(screen.getByText('No matches fit these filters.')).toBeDefined();
    expect(screen.queryByText('Club E vs Club F')).toBeNull();
  });

  it('explains that officials are unavailable without rendering empty fieldsets', () => {
    renderSchedule();

    expect(screen.getByText('No officials are available to assign.')).toBeDefined();
    expect(screen.queryByRole('group', { name: 'Officials' })).toBeNull();
    expect(screen.getAllByText('No officials are available to assign.')).toHaveLength(1);
  });

  it('explains that a preview is required before publishing', () => {
    renderSchedule();

    expect(screen.getByText('Preview the current assignments before publishing.')).toBeDefined();
    expect(
      (screen.getByRole('button', { name: 'Publish schedule' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
