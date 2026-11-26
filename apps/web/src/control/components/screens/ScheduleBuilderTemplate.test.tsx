import { jest } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { withIntl } from '../../i18n/test-support.js';
import { ScheduleBuilderTemplate } from './ScheduleBuilderTemplate.js';
import type { FixtureResponse } from '../../lib/api-client.js';

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

  describe('the stream link of a match', () => {
    const row = 'Club A vs Club B';
    const streamProps = (
      overrides: Partial<ComponentProps<typeof ScheduleBuilderTemplate>> = {},
    ): ComponentProps<typeof ScheduleBuilderTemplate> => ({
      ...props,
      onSetStreamUrl: jest.fn(),
      ...overrides,
    });

    it('refuses an unusable link on the page and saves a valid one', () => {
      const streamProps0 = streamProps();
      render(withIntl(<ScheduleBuilderTemplate {...streamProps0} />));

      fireEvent.click(screen.getByRole('button', { name: `Edit stream — ${row}` }));
      fireEvent.change(screen.getByLabelText('Stream link'), {
        target: { value: 'ftp://example.org/stream' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save link' }));

      expect(screen.getByRole('alert').textContent).toBe(
        'Enter a full link, up to 2048 characters, that starts with http:// or https://',
      );
      expect(streamProps0.onSetStreamUrl).not.toHaveBeenCalled();

      // A link one character over the limit is refused on the page too.
      fireEvent.change(screen.getByLabelText('Stream link'), {
        target: {
          value: `https://example.org/${'a'.repeat(2048 - 'https://example.org/'.length + 1)}`,
        },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save link' }));
      expect(screen.getByRole('alert').textContent).toContain('2048 characters');
      expect(streamProps0.onSetStreamUrl).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText('Stream link'), {
        target: { value: ' https://example.org/live/semifinal-1 ' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save link' }));

      expect(streamProps0.onSetStreamUrl).toHaveBeenCalledWith(
        'match-1',
        'https://example.org/live/semifinal-1',
      );
      expect(screen.queryByLabelText('Stream link')).toBeNull();
    });

    it('opens with the saved link and clears it on request', () => {
      const withSaved = streamProps({
        fixtures: props.fixtures.map((fixture) =>
          fixture.matchId === 'match-1'
            ? {
                ...fixture,
                matches: [
                  {
                    matchId: 'match-1',
                    number: 1,
                    status: 'scheduled',
                    streamUrl: 'https://example.org/live/saved',
                  },
                ],
              }
            : fixture,
        ),
      });
      render(withIntl(<ScheduleBuilderTemplate {...withSaved} />));

      fireEvent.click(screen.getByRole('button', { name: `Edit stream — ${row}` }));
      expect((screen.getByLabelText('Stream link') as HTMLInputElement).value).toBe(
        'https://example.org/live/saved',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Remove link' }));

      expect(withSaved.onSetStreamUrl).toHaveBeenCalledWith('match-1', null);
    });

    it('shows and edits each game of a best-of-three on its own link, never the first game’s', () => {
      const series = {
        span: 3,
        guaranteedMatches: 2,
        matchesPlayed: 0,
        anulledMatchNumbers: [],
      };
      const bestOfThree: FixtureResponse = {
        fixtureId: 'fixture-series',
        matchId: 'game-1',
        round: 1,
        homeEntrantId: 'club-a',
        homeName: 'Club A',
        awayEntrantId: 'club-d',
        awayName: 'Club D',
        series,
        matches: [
          { matchId: 'game-1', number: 1, status: 'scheduled' },
          {
            matchId: 'game-2',
            number: 2,
            status: 'scheduled',
            streamUrl: 'https://example.org/live/game-2',
          },
          { matchId: 'game-3', number: 3, status: 'scheduled' },
        ],
      };
      const series3 = streamProps({ fixtures: [bestOfThree] });
      render(withIntl(<ScheduleBuilderTemplate {...series3} />));

      // Game 1 has no link, so its row shows none and its editor opens empty.
      fireEvent.click(
        screen.getByRole('button', { name: 'Edit stream — Club A vs Club D — Game 1 of 3' }),
      );
      expect((screen.getByLabelText('Stream link') as HTMLInputElement).value).toBe('');
      fireEvent.click(
        screen.getByRole('button', { name: 'Edit stream — Club A vs Club D — Game 1 of 3' }),
      );

      // Game 2's own link shows on its row and opens in its editor; saving the editor as shown keeps it.
      expect(screen.getByText('https://example.org/live/game-2')).toBeDefined();
      fireEvent.click(
        screen.getByRole('button', { name: 'Edit stream — Club A vs Club D — Game 2 of 3' }),
      );
      expect((screen.getByLabelText('Stream link') as HTMLInputElement).value).toBe(
        'https://example.org/live/game-2',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Save link' }));
      expect(series3.onSetStreamUrl).toHaveBeenCalledWith(
        'game-2',
        'https://example.org/live/game-2',
      );
      expect(series3.onSetStreamUrl).not.toHaveBeenCalledWith('game-2', null);
    });

    it('closes the editor when its disclosure is pressed again, without saving', () => {
      const closing = streamProps();
      render(withIntl(<ScheduleBuilderTemplate {...closing} />));

      fireEvent.click(screen.getByRole('button', { name: `Edit stream — ${row}` }));
      expect(screen.getByLabelText('Stream link')).toBeDefined();
      fireEvent.click(screen.getByRole('button', { name: `Edit stream — ${row}` }));

      expect(screen.queryByLabelText('Stream link')).toBeNull();
      expect(closing.onSetStreamUrl).not.toHaveBeenCalled();
    });
  });

  it('explains that a preview is required before publishing', () => {
    renderSchedule();

    expect(screen.getByText('Preview the current assignments before publishing.')).toBeDefined();
    expect(
      (screen.getByRole('button', { name: 'Publish schedule' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  describe('choosing a slot by day, then by time and venue', () => {
    const select = (name: string) => screen.getByLabelText(name) as HTMLSelectElement;
    const optionTexts = (element: HTMLSelectElement) =>
      [...element.options].map((option) => option.textContent);

    it('lists only the chosen day’s slots, as time and venue', () => {
      renderSchedule();

      const day = select('Day — Club A vs Club B');
      const slot = select('Start time — Club A vs Club B');
      expect(day.selectedOptions[0]?.textContent).toContain('Oct 29');
      expect(optionTexts(slot)).toEqual([
        'Unassigned',
        '12:00 · Cancha Central',
        '13:00 · Cancha Norte',
      ]);
    });

    it('keeps the slot unavailable until a day is chosen, then lists that day', () => {
      renderSchedule();

      const day = select('Day — Club G vs Club H');
      const slot = select('Start time — Club G vs Club H');
      expect(slot.disabled).toBe(true);

      const secondDay = [...day.options].find((option) => option.textContent?.includes('Oct 30'));
      fireEvent.change(day, { target: { value: secondDay?.value } });

      expect(slot.disabled).toBe(false);
      expect(optionTexts(slot)).toEqual(['Unassigned', '12:00 · Cancha Central']);
    });

    it('clears a slot that belongs to another day when the day changes', () => {
      const onSetDraft = jest.fn();
      render(withIntl(<ScheduleBuilderTemplate {...props} onSetDraft={onSetDraft} />));

      const day = select('Day — Club A vs Club B');
      const secondDay = [...day.options].find((option) => option.textContent?.includes('Oct 30'));
      fireEvent.change(day, { target: { value: secondDay?.value } });

      expect(onSetDraft).toHaveBeenCalledWith('match-1', { slotId: '' });
    });

    it('disables a slot that is full and says so, but never the match’s own slot', () => {
      const [schedule] = props.schedules;
      const fullSchedules = [
        {
          ...schedule,
          slots: schedule.slots.map((slot) => ({ ...slot, matchCount: 1 })),
        },
      ];
      render(withIntl(<ScheduleBuilderTemplate {...props} schedules={fullSchedules} />));

      const slot = select('Start time — Club A vs Club B');
      const byText = (text: string) =>
        [...slot.options].find((option) => option.textContent === text);
      expect(byText('13:00 · Cancha Norte · Full')?.disabled).toBe(true);
      expect(byText('12:00 · Cancha Central')?.disabled).toBe(false);
    });
  });

  describe('officials', () => {
    const officials = [
      { officialId: 'official-1', organizationId, displayName: 'Ana Gómez', roles: [] },
      { officialId: 'official-2', organizationId, displayName: 'Beto Ruiz', roles: [] },
    ];

    it('renders no picker until a row is opened, and only for that row', () => {
      const { container } = render(
        withIntl(
          <ScheduleBuilderTemplate
            {...props}
            drafts={{
              ...props.drafts,
              'match-1': { slotId: 'slot-1', officialIds: ['official-2'] },
            }}
            officials={officials}
          />,
        ),
      );

      expect(container.querySelectorAll('fieldset')).toHaveLength(0);
      expect(screen.queryByLabelText('Ana Gómez')).toBeNull();
      expect(screen.getByText('Officials: Beto Ruiz')).toBeDefined();
      expect(screen.getAllByText('No officials assigned')).toHaveLength(3);

      fireEvent.click(screen.getByRole('button', { name: /^Edit officials — Club A vs Club B/ }));
      expect(container.querySelectorAll('fieldset')).toHaveLength(1);
      expect(
        within(container.querySelector('fieldset') as HTMLElement).getAllByRole('checkbox'),
      ).toHaveLength(2);

      fireEvent.click(screen.getByRole('button', { name: /^Edit officials — Club C vs Club D/ }));
      expect(container.querySelectorAll('fieldset')).toHaveLength(1);
      expect(
        screen.getByRole('button', { name: /^Edit officials — Club A vs Club B/ }),
      ).toBeDefined();
    });
  });
});
