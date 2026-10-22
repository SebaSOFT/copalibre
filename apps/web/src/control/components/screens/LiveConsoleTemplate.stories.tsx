import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveConsoleTemplate } from '../screens/LiveConsoleTemplate.js';
import { ORG, tournament } from '../screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/LiveConsoleTemplate',
  component: LiveConsoleTemplate,
  args: {
    failed: false,
    loading: false,
    onRetry: () => undefined,
    organizationAlias: ORG,
    staleSince: undefined,
    tournaments: [tournament],
  },
} satisfies Meta<typeof LiveConsoleTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { tournaments: [] } };
export const Loading: Story = { args: { loading: true, tournaments: [] } };
export const Failed: Story = { args: { failed: true, tournaments: [] } };
export const Stale: Story = { args: { staleSince: Date.now() - 60_000 } };
