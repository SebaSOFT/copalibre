import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  AddParticipantDialog,
  EditIdentityDialog,
  EditTeamMembersDialog,
  LinkIdentityDialog,
} from './RegistrationReviewDialogs.js';
import { reviewRows } from '../screen-story-fixtures.js';

const noop = () => undefined;
const noopAsync = async () => undefined;
const [firstRow] = reviewRows;

const meta = {
  title: 'Admin/Screens/Registration review dialogs',
  component: AddParticipantDialog,
  args: { open: true, onClose: noop, onSubmit: noopAsync },
} satisfies Meta<typeof AddParticipantDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AddParticipant: Story = {};

export const EditIdentity: StoryObj<typeof EditIdentityDialog> = {
  render: () => <EditIdentityDialog row={firstRow} onClose={noop} onSubmit={noopAsync} />,
};

export const LinkIdentity: StoryObj<typeof LinkIdentityDialog> = {
  render: () => (
    <LinkIdentityDialog displayName={firstRow.displayName} onClose={noop} onSubmit={noopAsync} />
  ),
};

export const EditTeamMembers: StoryObj<typeof EditTeamMembersDialog> = {
  render: () => <EditTeamMembersDialog row={firstRow} onClose={noop} onSubmit={noopAsync} />,
};
