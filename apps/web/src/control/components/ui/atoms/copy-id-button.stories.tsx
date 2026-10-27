import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { messages } from '../../../i18n/messages.en.js';
import { CopyIdButton } from './copy-id-button.js';

const meta = {
  title: 'Admin/Atoms/CopyIdButton',
  component: CopyIdButton,
} satisfies Meta<typeof CopyIdButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    label: '',
    copiedLabel: '',
    failedLabel: '',
    value: '01800000-0000-7000-8000-000000000001',
  },
  render: function Render(args) {
    const intl = useIntl();
    return (
      <CopyIdButton
        {...args}
        label={intl.formatMessage(messages.copyIdButton)}
        copiedLabel={intl.formatMessage(messages.copyIdSuccess)}
        failedLabel={intl.formatMessage(messages.copyIdFailure)}
      />
    );
  },
};
