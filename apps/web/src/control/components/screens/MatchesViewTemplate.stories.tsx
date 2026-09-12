import type { Meta, StoryObj } from '@storybook/react-vite';
import { MatchesViewTemplate } from '../screens/MatchesViewTemplate.js';
import { matchCardLabelsFromControlIntl } from '../../lib/matches-view-labels.js';
import { storyIntl, liveMatch } from '../screen-story-fixtures.js';

const labels = matchCardLabelsFromControlIntl(storyIntl('en'));

const meta = {
  title: 'Admin/Screens/MatchesViewTemplate',
  component: MatchesViewTemplate,
  args: {
    labels,
    matches: [liveMatch],
    onSelectState: () => undefined,
    state: 'all',
    status: 'ready',
  },
} satisfies Meta<typeof MatchesViewTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { matches: [] } };
export const Failed: Story = { args: { matches: [], status: 'error' } };
