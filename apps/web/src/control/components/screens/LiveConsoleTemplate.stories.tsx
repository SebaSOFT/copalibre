import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveConsoleTemplate } from '../screens/LiveConsoleTemplate.js';
import { ORG, tournament } from '../screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/LiveConsoleTemplate',
  component: LiveConsoleTemplate,
  args: {
    loading: false,
    organizationAlias: ORG,
    tournaments: [tournament],
  },
} satisfies Meta<typeof LiveConsoleTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { tournaments: [] } };
export const Loading: Story = { args: { loading: true, tournaments: [] } };
