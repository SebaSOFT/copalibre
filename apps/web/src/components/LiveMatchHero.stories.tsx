import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveMatchHero } from './LiveMatchHero.js';
import { publicIntl, resultStateLabels } from '../lib/i18n/public-intl.js';
import { messages as publicMessages } from '../lib/i18n/public-messages.en.js';
import type { LiveDashboard } from '../lib/live-state.js';
import type { SupportedLanguage } from '../lib/language-preference.js';

/**
 * The island starts from what the server rendered and patches it from a stream.
 * In the workbench `streamPath` points at nothing, so the connection simply
 * never opens — which is the state the component is designed for: the props
 * stay the truth and the "using last known" notice remains. That failure mode
 * is worth reviewing, and it is otherwise reachable only by breaking the API.
 */
/**
 * Six matches, not two.
 *
 * The grid is the thing worth reviewing here, and two cards cannot show it: at
 * a desktop width they occupy two of four column tracks and the layout reads
 * the same as it did when there was no grid at all. A fixture has to be big
 * enough to exercise what the story exists to demonstrate.
 */
const SIDES: readonly (readonly [string, string, number, string, string, number])[] = [
  ['Club Atlético Independiente', 'CAI', 2, 'Deportivo San Juan', 'DSJ', 1],
  ['Unión de Rivadavia', 'UNR', 3, 'Atlético Chimbas', 'ACH', 0],
  ['Sportivo Desamparados', 'SDE', 1, 'Villa Krause', 'VKR', 1],
  ['Peñarol de San Juan', 'PSJ', 0, 'Trinidad FC', 'TFC', 2],
  ['San Martín', 'SMA', 4, 'Del Bono', 'DBO', 2],
  ['Colón Junior', 'CJR', 1, 'Marquesado', 'MAR', 3],
];

const DASHBOARD: LiveDashboard = {
  standingsVersion: 12,
  usingLastKnown: true,
  matches: SIDES.map(([home, homeAbbr, homeScore, away, awayAbbr, awayScore], index) => {
    const live = index % 2 === 0;
    return {
      matchId: `m-${index + 1}`,
      stageNumber: 1,
      matchNumber: index + 1,
      state: live ? ('live' as const) : ('final' as const),
      projectionVersion: 12,
      ...(live ? { clockSeconds: 4726 - index * 600 } : {}),
      sides: [
        {
          entrantId: `e-${index}-h`,
          name: home,
          abbreviation: homeAbbr,
          score: homeScore,
          state: live
            ? ('live' as const)
            : homeScore > awayScore
              ? ('winner' as const)
              : ('loser' as const),
        },
        {
          entrantId: `e-${index}-a`,
          name: away,
          abbreviation: awayAbbr,
          score: awayScore,
          state: live
            ? ('live' as const)
            : awayScore > homeScore
              ? ('winner' as const)
              : ('loser' as const),
        },
      ],
    };
  }),
};

function labelsFor(locale: SupportedLanguage) {
  return resultStateLabels(publicIntl(locale));
}

const meta = {
  title: 'Public/LiveMatchHero',
  component: LiveMatchHero,
  args: {
    initial: DASHBOARD,
    streamPath: '/stories/no-stream',
    usingLastKnownText: '',
    resultStateLabels: labelsFor('en'),
  },
} satisfies Meta<typeof LiveMatchHero>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UsingLastKnown: Story = {
  render: (_args, context) => {
    const locale = context.globals.locale as SupportedLanguage;
    return (
      <LiveMatchHero
        initial={DASHBOARD}
        resultStateLabels={labelsFor(locale)}
        streamPath="/stories/no-stream"
        usingLastKnownText={publicIntl(locale).formatMessage(publicMessages.liveUsingLastKnown)}
      />
    );
  },
};

/** Nothing scheduled: the empty dashboard, which no seeded tournament shows. */
export const NoMatches: Story = {
  render: (_args, context) => {
    const locale = context.globals.locale as SupportedLanguage;
    return (
      <LiveMatchHero
        initial={{ matches: [], standingsVersion: 0, usingLastKnown: false }}
        resultStateLabels={labelsFor(locale)}
        streamPath="/stories/no-stream"
        usingLastKnownText=""
      />
    );
  },
};
