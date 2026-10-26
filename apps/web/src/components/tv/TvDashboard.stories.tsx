import type { SupportedLanguage } from '@copalibre/domain';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TvDashboard } from './TvDashboard.js';
import { publicIntl, tvDashboardLabels, tvStatisticsLabels } from '../../lib/i18n/public-intl.js';
import type { LiveDashboard, LiveMatch } from '../../lib/live-state.js';
import type { BracketZone } from '../../lib/bracket-projection.js';
import type { TvMatchEvent } from '../../lib/tv-match-events.js';
import { DASHBOARD, STANDINGS, renderDashboard } from './tv-dashboard-story-fixtures.js';

const layoutDashboard: LiveDashboard = {
  ...DASHBOARD,
  matches: [
    ...(DASHBOARD.matches[0] ? [DASHBOARD.matches[0]] : []),
    {
      matchId: 'm-2',
      stageNumber: 1,
      matchNumber: 8,
      stageOrdinal: 8,
      state: 'live',
      projectionVersion: 13,
      clockSeconds: 1980,
      sides: [
        { entrantId: 'e-3', name: 'Atlético Unión', abbreviation: 'CAU', score: 1, state: 'live' },
        {
          entrantId: 'e-4',
          name: 'Centro Valenciano',
          abbreviation: 'VAL',
          score: 1,
          state: 'live',
        },
      ],
    },
    ...Array.from({ length: 4 }, (_, index): LiveMatch => ({
      matchId: `upcoming-${index + 1}`,
      stageNumber: 2,
      matchNumber: index + 1,
      stageOrdinal: index + 1,
      scheduledAt: new Date(Date.UTC(2026, 10, 7, 18 + index, 0)).toISOString(),
      state: 'upcoming',
      projectionVersion: 1,
      sides: [
        {
          entrantId: `upcoming-home-${index + 1}`,
          name:
            [
              'Club Atlético Independiente',
              'Deportivo San Juan',
              'Unión de Rivadavia',
              'Atlético Mendoza',
            ][index] ?? 'Local',
          score: 0,
          state: 'upcoming',
        },
        {
          entrantId: `upcoming-away-${index + 1}`,
          name:
            [
              'Deportivo San Juan del Valle',
              'Atlético Unión',
              'Club Atlético Independiente',
              'Centro Valenciano',
            ][index] ?? 'Visitante',
          score: 0,
          state: 'upcoming',
        },
      ],
    })),
  ],
};

const layoutStandings = STANDINGS.map((row, index) => ({
  ...row,
  zoneName: index < 2 ? 'Zona A' : 'Zona B',
}));

const layoutBracket: readonly BracketZone[] = [
  {
    zoneId: 'zona-a-final',
    zoneName: 'Zona A',
    format: 'single-elimination',
    matches: [
      {
        matchId: 'bracket-final',
        matchNumber: 1,
        roundNumber: 1,
        branch: 'winners',
        state: 'final',
        scores: [2, 1],
        slots: [
          { kind: 'entrant', entrantId: 'e-1', name: 'Club Atlético Independiente' },
          { kind: 'entrant', entrantId: 'e-2', name: 'Deportivo San Juan' },
        ],
      },
    ],
  },
];

const layoutEvents: Readonly<Record<string, readonly TvMatchEvent[]>> = {
  'm-1': [
    {
      eventId: 'event-m-1',
      definitionCode: 'score',
      label: 'Punto',
      occurredAt: '2026-10-26T18:42:00.000Z',
      side: 'home',
      actor: 'C. Mendoza',
    },
  ],
  'm-2': [
    {
      eventId: 'event-m-2',
      definitionCode: 'score',
      label: 'Punto',
      occurredAt: '2026-10-26T18:40:00.000Z',
      side: 'away',
      actor: 'M. Ferreyra',
    },
  ],
};

function renderLayout(layoutVariant: 'presentation' | 'dashboard') {
  return function LayoutStory(_args: unknown, context: { globals: Record<string, unknown> }) {
    const language = (context.globals.locale ?? 'en') as SupportedLanguage;
    const intl = publicIntl(language);
    return (
      <TvDashboard
        dashboardLabels={tvDashboardLabels(intl)}
        initial={layoutDashboard}
        initialBracket={{ stageNumber: 1, zones: layoutBracket }}
        labels={tvStatisticsLabels(intl)}
        language={language}
        layoutVariant={layoutVariant}
        matchEventsById={layoutEvents}
        organizationName="Liga Sanjuanina"
        presentation="kiosk"
        standings={layoutStandings}
        streamPath="/stories/no-stream"
        timeZone="America/Argentina/San_Juan"
        tournamentName="Copa Primavera"
      />
    );
  };
}

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
export const LivePresentation: Story = { render: renderLayout('presentation') };
export const MultiMatchDashboard: Story = { render: renderLayout('dashboard') };

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
