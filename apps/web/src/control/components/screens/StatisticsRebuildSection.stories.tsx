import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatisticsRebuildSection } from './StatisticsRebuildSection.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { storyClient, ORG } from '../screen-story-fixtures.js';

const client = storyClient<ControlApiClient>({
  rebuildStatistics: undefined,
});

const meta = {
  title: 'Admin/Screens/Preferences sections/Statistics rebuild',
  component: StatisticsRebuildSection,
  args: {
    api: client,
    canRebuild: true,
    dismissedRebuildResult: false,
    onDismissRebuildResult: () => undefined,
    onPreviewRebuild: async () => undefined,
    organizationAlias: ORG,
    rebuildBusy: false,
    rebuildResult: undefined,
    rebuildTournamentAlias: '',
    setRebuildTournamentAlias: () => undefined,
  },
} satisfies Meta<typeof StatisticsRebuildSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};
export const Busy: Story = { args: { rebuildBusy: true } };
export const ReadOnly: Story = { args: { canRebuild: false } };
export const TournamentScoped: Story = { args: { rebuildTournamentAlias: 'apertura-2026' } };
