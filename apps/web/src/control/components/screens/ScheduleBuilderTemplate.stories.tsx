import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScheduleBuilderTemplate } from '../screens/ScheduleBuilderTemplate.js';
import { ORG, TOURNAMENT, NOW, ids } from '../screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/ScheduleBuilderTemplate',
  component: ScheduleBuilderTemplate,
  args: {
    affectedPublishedMatches: [],
    committable: false,
    conflicts: [],
    drafts: {},
    fixtures: [
      {
        fixtureId: ids.match,
        matchId: ids.match,
        round: 1,
        homeEntrantId: ids.first,
        awayEntrantId: ids.second,
      },
    ],
    officials: [],
    onPreview: () => undefined,
    onPublish: () => undefined,
    onSetDraft: () => undefined,
    onToggleOfficial: () => undefined,
    organizationAlias: ORG,
    previewed: false,
    schedules: [
      {
        scheduleId: ids.stage,
        organizationId: ids.organization,
        name: 'Copa Premier',
        startsAt: Date.parse(NOW),
        endsAt: Date.parse(NOW) + 7_200_000,
        slotMinutes: 90,
        turnaroundMinutes: 15,
        venueIds: [ids.third],
        slots: [
          {
            slotId: ids.first,
            scheduleId: ids.stage,
            venueId: ids.third,
            startsAt: Date.parse(NOW),
            matchCount: 0,
          },
        ],
      },
    ],
    stageNumber: 1,
    tournamentAlias: TOURNAMENT,
    venues: [
      {
        venueId: ids.third,
        organizationId: ids.organization,
        alias: 'cancha-central',
        name: 'Cancha Central',
        concurrentCapacity: 1,
      },
    ],
  },
} satisfies Meta<typeof ScheduleBuilderTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NoFixtures: Story = { args: { fixtures: [] } };
export const Unassigned: Story = {};
export const WithConflict: Story = {
  args: {
    previewed: true,
    affectedPublishedMatches: [ids.second],
    conflicts: [
      {
        kind: 'venue-overlap',
        matchId: ids.match,
        conflictsWithMatchId: ids.second,
        resourceId: ids.third,
        detail: 'Cancha Central / Meridian Seven',
      },
    ],
  },
};
