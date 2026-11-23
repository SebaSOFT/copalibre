import type { Meta, StoryObj } from '@storybook/react-vite';
import { liveClockLabels, publicIntl } from '../../../lib/i18n/public-intl.js';
import type { SupportedLanguage } from '../../../lib/language-preference.js';
import { LiveMatchScoreboard } from './LiveMatchScoreboard.js';

const enLabels = liveClockLabels(publicIntl('en'));

const meta = {
  title: 'Public/LiveMatchScoreboard',
  component: LiveMatchScoreboard,
  args: {
    clock: {
      segmentNumber: 1,
      elapsedSeconds: 1845,
      running: true,
      asOf: '2026-09-04T18:30:45.000Z',
    },
    segmentLabel: '1st Half',
    locale: 'en',
    timeZone: 'America/Argentina/San_Juan',
    labels: enLabels,
  },
} satisfies Meta<typeof LiveMatchScoreboard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args, context) => {
    const locale = (context.globals.locale ?? 'en') as SupportedLanguage;
    return (
      <LiveMatchScoreboard {...args} labels={liveClockLabels(publicIntl(locale))} locale={locale} />
    );
  },
};

export const DisconnectedPaused: Story = {
  render: (_args, context) => {
    const locale = (context.globals.locale ?? 'en') as SupportedLanguage;
    return (
      <LiveMatchScoreboard
        clock={{
          segmentNumber: 2,
          elapsedSeconds: 2700,
          running: false,
          asOf: '2026-09-04T19:15:00.000Z',
        }}
        labels={liveClockLabels(publicIntl(locale))}
        lastUpdatedAt="2026-09-04T19:15:00.000Z"
        locale={locale}
        segmentLabel="2nd Half"
        timeZone="America/Argentina/San_Juan"
        usingLastKnown
      />
    );
  },
};
