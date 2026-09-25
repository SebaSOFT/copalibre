import type { Meta, StoryObj } from '@storybook/react-vite';
import { publicIntl, tvDashboardLabels } from '../../../../lib/i18n/public-intl.js';
import { TvStandingsTable } from './TvStandingsTable.js';

const meta = {
  title: 'TV/Kiosk & Full-Frame Widget/TvStandingsTable',
  component: TvStandingsTable,
  args: {
    dashboardLabels: tvDashboardLabels(publicIntl('es')),
    pointsShortLabel: 'Pts',
    standings: [
      {
        position: 1,
        name: 'Club Atlético Independiente',
        abbreviation: 'CAI',
        played: 8,
        points: 19,
      },
      { position: 2, name: 'Deportivo San Juan', abbreviation: 'DSJ', played: 8, points: 17 },
    ],
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TvStandingsTable>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Unavailable: Story = { args: { standings: [] } };
