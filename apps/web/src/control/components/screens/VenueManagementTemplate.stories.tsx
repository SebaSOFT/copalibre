import type { Meta, StoryObj } from '@storybook/react-vite';
import { VenueManagementTemplate } from '../screens/VenueManagementTemplate.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { storyClient, ORG, ids } from '../screen-story-fixtures.js';

const client = storyClient<ControlApiClient>({
  createVenue: undefined,
  createOfficial: undefined,
  createSchedule: undefined,
});

const meta = {
  title: 'Admin/Screens/VenueManagementTemplate',
  component: VenueManagementTemplate,
  args: {
    api: client,
    officials: [],
    onCreateOfficial: async () => true,
    onCreateSchedule: async () => true,
    onCreateVenue: async () => true,
    onDeleteSchedule: async () => true,
    onSaveOfficial: async () => undefined,
    onSaveSchedule: async () => undefined,
    onSaveVenue: async () => undefined,
    organizationAlias: ORG,
    schedules: [],
    venues: [],
  },
} satisfies Meta<typeof VenueManagementTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const WithData: Story = {
  args: {
    venues: [
      {
        venueId: ids.first,
        organizationId: ids.organization,
        alias: 'cancha-central',
        name: 'Cancha Central',
        concurrentCapacity: 1,
      },
    ],
    officials: [
      {
        officialId: ids.person,
        organizationId: ids.organization,
        displayName: 'V. Kael',
        roles: ['referee'],
      },
    ],
    schedules: [
      {
        scheduleId: ids.second,
        organizationId: ids.organization,
        name: 'Fin de semana',
        startsAt: Date.parse('2026-09-08T10:00:00.000Z'),
        endsAt: Date.parse('2026-09-08T18:00:00.000Z'),
        slotMinutes: 60,
        turnaroundMinutes: 15,
        venueIds: [ids.first],
        slots: [],
      },
    ],
  },
};
