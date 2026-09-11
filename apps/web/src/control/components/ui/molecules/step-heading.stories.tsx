import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { StepHeading } from './step-heading.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Molecules/StepHeading',
  component: StepHeading,
  argTypes: {
    step: { control: { type: 'number', min: 1 } },
    title: { control: 'text' },
    level: { control: 'inline-radio', options: [2, 3, 4] },
  },
} satisfies Meta<typeof StepHeading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { step: 1, title: 'Create the tournament' },
};

/** A sequence, which is the only way to see that the markers align down the page. */
export const Matrix: Story = {
  args: { step: 1, title: '' },
  render: function Render() {
    const intl = useIntl();
    return (
      <div style={{ display: 'grid', gap: 'var(--cl-space-5)' }}>
        <StepHeading step={1} title={intl.formatMessage(storyText.tournaments)} />
        <StepHeading step={2} title={intl.formatMessage(storyText.settingsTitle)} />
        <StepHeading step={3} title={intl.formatMessage(storyText.rolesTitle)} />
        <StepHeading step={10} title={intl.formatMessage(storyText.reportTitle)} />
      </div>
    );
  },
};

/**
 * The case the marker's layout exists for.
 *
 * A long translated title at 188px wraps to several lines; the number stays
 * beside the first of them rather than letting the text flow underneath it.
 * Read this in German, and again at 200% zoom.
 */
export const LongTitleAtNarrowFloor: Story = {
  args: { step: 1, title: '' },
  render: function Render() {
    const intl = useIntl();
    return (
      <div style={{ maxWidth: '188px' }}>
        <StepHeading step={3} title={intl.formatMessage(storyText.savePromotionPlan)} />
      </div>
    );
  },
};
