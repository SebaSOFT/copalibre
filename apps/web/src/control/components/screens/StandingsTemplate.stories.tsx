import type { Meta, StoryObj } from '@storybook/react-vite';
import { StandingsTemplate } from '../screens/StandingsTemplate.js';
import { ORG, TITLE, projection } from '../screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/StandingsTemplate',
  component: StandingsTemplate,
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
} satisfies Meta<typeof StandingsTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { projection: { ...projection, rows: [] } } };
