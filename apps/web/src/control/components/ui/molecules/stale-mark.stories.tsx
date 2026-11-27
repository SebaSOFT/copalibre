import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { StaleMark } from './stale-mark.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Molecules/StaleMark',
  component: StaleMark,
} satisfies Meta<typeof StaleMark>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReferenceStaleData: Story = {
  args: { label: '', age: '18:42' },
  render: function Render() {
    const intl = useIntl();
    return (
      <StaleMark
        age={intl.formatRelativeTime(-2, 'minute')}
        label={intl.formatMessage(storyText.interactionStale)}
      />
    );
  },
};
