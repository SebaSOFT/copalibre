import type { Meta, StoryObj } from '@storybook/react-vite';
import { RosterRoleSelector } from './RosterRoleSelector.js';
import { ids } from './screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/RosterRoleSelector',
  component: RosterRoleSelector,
  args: {
    members: [{ personId: ids.person, displayName: 'V. Kael', role: 'player' }],
    onChange: () => undefined,
  },
} satisfies Meta<typeof RosterRoleSelector>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { members: [] } };
export const Disabled: Story = { args: { disabled: true } };
