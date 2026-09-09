import type { Meta, StoryObj } from '@storybook/react-vite';
import { TournamentCard } from './TournamentCard.js';
import { ORG, TOURNAMENT, TITLE, ids } from './screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/TournamentCard',
  component: TournamentCard,
  args: {
    card: {
      tournamentId: ids.tournament,
      organizationId: ids.organization,
      alias: TOURNAMENT,
      name: TITLE,
      lifecycle: 'live',
      matchesToday: 8,
      pendingRegistrations: 12,
    },
    organizationAlias: ORG,
    onExport: () => undefined,
    onExportConfiguration: () => undefined,
    onArchive: () => undefined,
  },
} satisfies Meta<typeof TournamentCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Draft: Story = { args: { card: { ...meta.args.card, lifecycle: 'draft' } } };
export const Finished: Story = { args: { card: { ...meta.args.card, lifecycle: 'finished' } } };
