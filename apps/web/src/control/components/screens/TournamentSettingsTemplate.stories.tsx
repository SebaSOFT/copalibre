import type { Meta, StoryObj } from '@storybook/react-vite';
import { TournamentSettingsTemplate } from '../screens/TournamentSettingsTemplate.js';
import { ORG, TOURNAMENT, TITLE } from '../screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/TournamentSettingsTemplate',
  component: TournamentSettingsTemplate,
  args: {
    organizationAlias: ORG,
    tournamentAlias: TOURNAMENT,
    settings: { name: TITLE, region: 'San Juan', capacity: 16, featured: false },
    onPreview: async () => [],
    onSave: async () => undefined,
  },
} satisfies Meta<typeof TournamentSettingsTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
