import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { PersonPhotoPlaceholder, ClubEmblemPlaceholder } from './placeholders.js';
import { messages } from '../i18n/messages.en.js';
const meta = {
  title: 'Admin/Screens/Placeholders',
  component: PersonPhotoPlaceholder,
  args: { title: '' },
  render: function Render(args) {
    const intl = useIntl();
    return (
      <PersonPhotoPlaceholder
        {...args}
        title={intl.formatMessage(messages.personProfilePhotoPlaceholderAlt)}
      />
    );
  },
} satisfies Meta<typeof PersonPhotoPlaceholder>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Club: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <ClubEmblemPlaceholder title={intl.formatMessage(messages.jerseyGridEmblemPlaceholderAlt)} />
    );
  },
};
