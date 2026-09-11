import type { Meta, StoryObj } from '@storybook/react-vite';
import { ZoneGroupTemplate } from '../screens/ZoneGroupTemplate.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { ORG, TOURNAMENT, ids, registrations, storyClient } from '../screen-story-fixtures.js';

const client = storyClient<ControlApiClient>({
  renameZone: undefined,
  deleteZone: undefined,
  createZone: undefined,
  renameGroup: undefined,
  deleteGroup: undefined,
  createGroup: undefined,
});

const meta = {
  title: 'Admin/Screens/ZoneGroupTemplate',
  component: ZoneGroupTemplate,
  args: {
    api: client,
    entrantLabel: (entrantId: string) =>
      registrations.find((row) => row.entrantId === entrantId)?.displayName ?? entrantId,
    entrants: registrations.filter((row) => row.status === 'accepted'),
    groups: [],
    onConfirmGroupDraw: async () => true,
    onConfirmZoneDraw: async () => true,
    onCreateGroup: async () => true,
    onCreateZone: async () => true,
    onDeleteGroup: async () => undefined,
    onDeleteZone: async () => undefined,
    onPreviewGroupDraw: async () => undefined,
    onPreviewZoneDraw: async () => undefined,
    onRenameGroup: async () => undefined,
    onRenameZone: async () => undefined,
    onSaveGroupManualAssignment: async () => true,
    onSaveZoneManualAssignment: async () => true,
    onSelectZone: () => undefined,
    organizationAlias: ORG,
    selectedZoneNumber: 1,
    stageNumber: 1,
    tournamentAlias: TOURNAMENT,
    zoneEntrantIds: [ids.second, ids.third],
    zones: [
      {
        zoneId: ids.third,
        stageId: ids.stage,
        number: 1,
        name: 'Copa Premier',
      },
    ],
  },
} satisfies Meta<typeof ZoneGroupTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NoZones: Story = { args: { zones: [], selectedZoneNumber: undefined } };
export const WithZone: Story = {
  args: {
    groups: [
      {
        groupId: ids.match,
        zoneId: ids.third,
        number: 1,
        name: 'A',
      },
    ],
  },
};
