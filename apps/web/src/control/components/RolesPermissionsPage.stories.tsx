import type { Meta, StoryObj } from '@storybook/react-vite';
import { RolesPermissionsPage } from './RolesPermissionsPage.js';
import { ORG, ids } from './screen-story-fixtures.js';

const meta = {
  title: 'Admin/Screens/RolesPermissionsPage',
  component: RolesPermissionsPage,
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
} satisfies Meta<typeof RolesPermissionsPage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Loading: Story = { args: { loading: true } };

export const Empty: Story = { args: { rows: [] } };
