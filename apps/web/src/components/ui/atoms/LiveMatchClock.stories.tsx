import type { Meta, StoryObj } from '@storybook/react-vite';
import { liveClockLabels, publicIntl } from '../../../lib/i18n/public-intl.js';
import type { SupportedLanguage } from '../../../lib/language-preference.js';
import { LiveMatchClock } from './LiveMatchClock.js';

const enLabels = liveClockLabels(publicIntl('en'));

const meta = {
  title: 'Public/LiveMatchClock',
  component: LiveMatchClock,
  args: {
    clock: {
      segmentNumber: 1,
      elapsedSeconds: 1245,
      running: true,
      asOf: '2026-09-04T18:20:45.000Z',
    },
    segmentLabel: '1st Half',
    labels: enLabels,
    variant: 'public',
  },
} satisfies Meta<typeof LiveMatchClock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args, context) => {
    const locale = (context.globals.locale ?? 'en') as SupportedLanguage;
    const labels = liveClockLabels(publicIntl(locale));
    return <LiveMatchClock {...args} labels={labels} />;
  },
};

export const Matrix: Story = {
  render: (_args, context) => {
    const locale = (context.globals.locale ?? 'en') as SupportedLanguage;
    const labels = liveClockLabels(publicIntl(locale));
    return (
      <div>
        <LiveMatchClock
          clock={{
            segmentNumber: 1,
            elapsedSeconds: 825,
            running: true,
            asOf: '2026-09-04T18:13:45.000Z',
          }}
          labels={labels}
          segmentLabel="1st Half"
          variant="public"
        />
        <LiveMatchClock
          clock={{
            segmentNumber: 2,
            elapsedSeconds: 2700,
            running: false,
            asOf: '2026-09-04T18:45:00.000Z',
          }}
          labels={labels}
          segmentLabel="2nd Half"
          variant="public"
        />
        <LiveMatchClock labels={labels} segmentLabel="3rd Set" variant="public" />
        <LiveMatchClock
          clock={{
            segmentNumber: 1,
            elapsedSeconds: 615,
            running: true,
            asOf: '2026-09-04T18:10:15.000Z',
          }}
          labels={labels}
          segmentLabel="1st Half"
          variant="tv"
        />
      </div>
    );
  },
};
