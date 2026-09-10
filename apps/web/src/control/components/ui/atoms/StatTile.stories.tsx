import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { StatTile } from './StatTile.js';
import { StoryMatrix } from '../story-matrix.js';
import { messages } from '../../../i18n/messages.en.js';

const meta = {
  title: 'Admin/Atoms/StatTile',
  component: StatTile,
  argTypes: {
    label: { control: 'text' },
    value: { control: 'text' },
    unavailableLabel: { control: 'text' },
  },
} satisfies Meta<typeof StatTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { label: 'Active tournaments', value: 12 },
};

/**
 * The distinction the tile exists to hold: a measured zero and an unmeasured
 * value must not look alike. The zero is a figure in the display face; the
 * absence is a word in the muted body role.
 */
export const Matrix: Story = {
  args: { label: '' },
  render: function Render() {
    const intl = useIntl();
    const unavailable = intl.formatMessage(messages.metricUnavailable);
    const label = intl.formatMessage(messages.dashboardActiveTournaments);
    return (
      <StoryMatrix
        cells={[
          { label: 'value', children: <StatTile label={label} value={12} /> },
          { label: 'measured zero', children: <StatTile label={label} value={0} /> },
          {
            label: 'unmeasured',
            children: <StatTile label={label} unavailableLabel={unavailable} />,
          },
          {
            label: 'demonstration',
            children: (
              <StatTile
                demonstrationLabel={intl.formatMessage(messages.metricDemonstration)}
                label={label}
                value={12}
              />
            ),
          },
        ]}
        minColumn="180px"
      />
    );
  },
};

/** A long translated label at the narrow floor wraps rather than clipping. */
export const LongLabel: Story = {
  args: { label: '' },
  render: function Render() {
    const intl = useIntl();
    return (
      <div style={{ maxWidth: '188px' }}>
        <StatTile label={intl.formatMessage(messages.dashboardPendingRegistrations)} value={7} />
      </div>
    );
  },
};
