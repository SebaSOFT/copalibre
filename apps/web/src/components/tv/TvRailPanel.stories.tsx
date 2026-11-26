import type { Meta, StoryObj } from '@storybook/react-vite';
import { tvOrganismStoryArgs } from './tv-organism-story-args.js';
import { DASHBOARD, PERFORMERS, STANDINGS } from './tv-dashboard-story-fixtures.js';
import { TvRailPanel } from './TvRailPanel.js';

const meta = {
  title: 'TV/Kiosk Monitor/TvRailPanel',
  component: TvRailPanel,
  args: {
    ...tvOrganismStoryArgs,
    fixedView: false,
    railTabs: ['standings', 'performers', 'facts'],
    activeTab: 'standings',
    setActiveTab: () => undefined,
    performersTabLabel: 'Goleadores',
    pinnedRef: undefined,
    pinnedMatch: undefined,
    railPaging: { pageRows: STANDINGS, pageCount: 1, pageIndex: 0 },
    railPage: 0,
    railStandingsRef: { current: null },
    fullFrameColumns: undefined,
    performers: PERFORMERS,
    facts: [],
    railBracketZones: [],
    matchPages: [],
    matches: DASHBOARD.matches,
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TvRailPanel>;
export default meta;

type Story = StoryObj<typeof meta>;

/** The standings tab, the rail's first section. */
export const Standings: Story = {};

/** The performers tab. */
export const Performers: Story = { args: { activeTab: 'performers' } };
