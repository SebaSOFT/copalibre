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
const DASHBOARD: LiveDashboard = {
  standingsVersion: 12,
  usingLastKnown: true,
  matches: [
    {
      matchId: 'm-1',
      stageNumber: 1,
      matchNumber: 7,
      state: 'live',
      projectionVersion: 12,
      clockSeconds: 4726,
      sides: [
        {
          entrantId: 'e-1',
          name: 'Club Atlético Independiente',
          abbreviation: 'CAI',
          score: 2,
          state: 'live',
        },
        {
          entrantId: 'e-2',
          name: 'Deportivo San Juan',
          abbreviation: 'DSJ',
          score: 1,
          state: 'live',
        },
      ],
    },
    {
      matchId: 'm-2',
      stageNumber: 1,
      matchNumber: 8,
      state: 'final',
      projectionVersion: 9,
      sides: [
        { entrantId: 'e-3', name: 'Unión de Rivadavia', score: 3, state: 'winner' },
        { entrantId: 'e-4', name: 'Atlético Chimbas', score: 0, state: 'loser' },
      ],
    },
  ],
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
