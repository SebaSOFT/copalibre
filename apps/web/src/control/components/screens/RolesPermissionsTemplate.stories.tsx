import type { Meta, StoryObj } from '@storybook/react-vite';
import { RolesPermissionsTemplate } from '../screens/RolesPermissionsTemplate.js';
import { ORG, ids } from '../screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/RolesPermissionsTemplate',
  component: RolesPermissionsTemplate,
  args: {
    organizationAlias: ORG,
    rows: [
      {
        assignmentId: ids.first,
        principalId: ids.person,
        email: 'referee@example.invalid',
        role: 'referee',
        status: 'active',
      },
    ],
    loading: false,
    onChange: async () => undefined,
    onDelete: async () => undefined,
    onInvite: async () => undefined,
  },
} satisfies Meta<typeof RolesPermissionsTemplate>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Loading: Story = { args: { loading: true } };

export const Empty: Story = { args: { rows: [] } };
