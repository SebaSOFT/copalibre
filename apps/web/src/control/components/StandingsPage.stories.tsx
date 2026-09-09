import type { Meta, StoryObj } from '@storybook/react-vite';
import { StandingsPage } from './StandingsPage.js';
import { ORG, TITLE, projection } from './screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/StandingsPage',
  component: StandingsPage,
  args: {
    organizationAlias: ORG,
    tournamentName: TITLE,
    projection,
    activeLayoutCode: projection.layoutCode,
    layouts: [
      {
        code: projection.layoutCode,
        target: projection.target,
        label: projection.label,
        entityGranularity: 'team',
      },
    ],
  },
} satisfies Meta<typeof StandingsPage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { projection: { ...projection, rows: [] } } };
