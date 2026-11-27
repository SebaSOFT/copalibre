import type { Meta, StoryObj } from '@storybook/react-vite';
import { FormattedMessage } from 'react-intl';
import { Container } from './container.js';
import { storyText } from '../../story-text.js';

const meta = {
  title: 'Admin/Atoms/Layout/Container',
  component: Container,
  args: { variant: 'control' },
} satisfies Meta<typeof Container>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The 90rem operator workspace container. */
export const Control: Story = {
  render: () => (
    <Container variant="control">
      <FormattedMessage {...storyText.settingsTitle} />
    </Container>
  ),
};

/** The 45rem form and settings container. */
export const Form: Story = {
  render: () => (
    <Container variant="form">
      <FormattedMessage {...storyText.settingsTitle} />
    </Container>
  ),
};
