import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { Skeleton } from './skeleton.js';
import { StoryMatrix } from '../story-matrix.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Atoms/Skeleton',
  component: Skeleton,
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { label: '', variant: 'block' },
  render: function Render() {
    const intl = useIntl();
    return (
      <Skeleton
        label={intl.formatMessage(storyText.interactionLoading, {
          thing: intl.formatMessage(storyText.tournaments),
        })}
        variant="block"
      />
    );
  },
};

export const Matrix: Story = {
  args: { label: '', variant: 'block' },
  render: function Render() {
    const intl = useIntl();
    const label = intl.formatMessage(storyText.interactionLoading, { thing: 'tournaments' });
    return (
      <StoryMatrix
        minColumn="180px"
        cells={(['block', 'line', 'table-row'] as const).map((variant) => ({
          label: variant,
          children: <Skeleton label={label} variant={variant} />,
        }))}
      />
    );
  },
};
