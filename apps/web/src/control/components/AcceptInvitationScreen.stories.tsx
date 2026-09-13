import type { Meta, StoryObj } from '@storybook/react-vite';
import { AcceptInvitationScreen } from './AcceptInvitationScreen.js';

const meta = {
  title: 'Admin/Screens/AcceptInvitationScreen',
  component: AcceptInvitationScreen,
  args: {
    initialToken: 'invite-token-abc123xyz',
  },
} satisfies Meta<typeof AcceptInvitationScreen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const MissingToken: Story = {
  args: {
    initialToken: undefined,
  },
};
