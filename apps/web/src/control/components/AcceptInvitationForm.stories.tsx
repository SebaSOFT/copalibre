import type { Meta, StoryObj } from '@storybook/react-vite';
import { AcceptInvitationForm } from './AcceptInvitationForm.js';

const meta = {
  title: 'Admin/Screens/AcceptInvitationForm',
  component: AcceptInvitationForm,
  args: {
    initialToken: 'invite-token-abc123xyz',
    navigate: () => undefined,
  },
} satisfies Meta<typeof AcceptInvitationForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const MissingToken: Story = {
  args: {
    initialToken: undefined,
  },
};
