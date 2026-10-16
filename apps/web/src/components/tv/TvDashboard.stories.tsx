import type { SupportedLanguage } from '@copalibre/domain';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TvDashboard } from './TvDashboard.js';
import { publicIntl, tvDashboardLabels, tvStatisticsLabels } from '../../lib/i18n/public-intl.js';
import { DASHBOARD, STANDINGS, renderDashboard } from './tv-dashboard-story-fixtures.js';

/**
 * The venue's own standalone screen — never composited over a camera feed,
 * so nothing here is transparent or chroma-keyed. See "TV/Stream Widgets" for
 * the OBS/vMix overlay presentations (`lower` and `full`) this same component
 * also renders.
 *
 * Review at the desktop viewport: this is what a venue's landscape or
 * vertical display actually shows, not a phone screen.
 */
const meta = {
  title: 'TV/Kiosk Monitor/TvDashboard',
  component: TvDashboard,
  args: {
    initial: DASHBOARD,
    streamPath: '/stories/no-stream',
    labels: tvStatisticsLabels(publicIntl('en')),
    dashboardLabels: tvDashboardLabels(publicIntl('en')),
    language: 'en',
    presentation: 'kiosk',
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TvDashboard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const KioskMonitor: Story = { render: renderDashboard('kiosk') };

/**
 * Nothing live. The kiosk has to survive an empty match list, which is what
 * it shows for most of a tournament day.
 */
export const NothingLive: Story = {
  render: (_args, context) => {
    const language = (context.globals.locale ?? 'en') as 'en' | 'es';
    return (
      <TvDashboard
        dashboardLabels={tvDashboardLabels(publicIntl(language))}
        initial={{ matches: [], standingsVersion: 0, usingLastKnown: false }}
        labels={tvStatisticsLabels(publicIntl(language))}
        language={language}
        organizationName="Liga Sanjuanina"
        presentation="kiosk"
        standings={STANDINGS}
        streamPath="/stories/no-stream"
        tournamentName="Copa Primavera"
      />
    );
  },
};

export const Rescheduled: Story = {
  render: (args, context) => {
    const language = (context.globals.locale ?? 'en') as SupportedLanguage;
    const intl = publicIntl(language);
    return (
      <TvDashboard
        {...args}
        language={language}
        labels={tvStatisticsLabels(intl)}
        dashboardLabels={tvDashboardLabels(intl)}
      />
    );
  },
  args: {
    initialView: 'matches',
    matchList: [
      {
        key: 'm-1',
        scope: 'Liga · 1',
        stateLabel: 'UPCOMING',
        home: { label: 'CAI', name: 'Club Atlético Independiente' },
        away: { label: 'DSJ', name: 'Deportivo San Juan' },
        scheduledAt: '2026-11-07T18:30:00.000Z',
        venueName: 'Cancha 2',
        rescheduledFrom: {
          startsAt: Date.UTC(2026, 10, 7, 14, 30),
          venue: { alias: 'cancha-1', name: 'Cancha 1' },
        },
      },
    ],
  },
};
