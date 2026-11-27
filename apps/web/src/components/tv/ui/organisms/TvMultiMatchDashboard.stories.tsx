import type { Meta, StoryObj } from '@storybook/react-vite';
import { tvOrganismStoryArgs } from '../../tv-organism-story-args.js';
import { DASHBOARD, STANDINGS } from '../../tv-dashboard-story-fixtures.js';
import { TvMultiMatchDashboard } from './TvMultiMatchDashboard.js';

const meta = {
  title: 'TV/Kiosk Monitor/TvMultiMatchDashboard',
  component: TvMultiMatchDashboard,
  args: {
    ...tvOrganismStoryArgs,
    liveMatches: DASHBOARD.matches,
    standingsPanelRef: { current: null },
    standingsPageCount: 1,
    activeStandingsPage: 0,
    dashboardStandings: STANDINGS,
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TvMultiMatchDashboard>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Live matches with the standings panel on one page. */
export const Loaded: Story = {};

/** No live match: the panel states that nothing is scheduled. */
export const Empty: Story = { args: { liveMatches: [] } };
