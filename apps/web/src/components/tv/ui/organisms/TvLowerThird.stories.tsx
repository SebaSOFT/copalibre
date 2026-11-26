import type { Meta, StoryObj } from '@storybook/react-vite';
import { TvLowerThird } from './TvLowerThird.js';
import { publicIntl, tvDashboardLabels } from '../../../../lib/i18n/public-intl.js';
import type { LiveMatch } from '../../../../lib/live-state.js';
import { tvMatchProgress } from '../../../../lib/tv-match-progress.js';

const labels = tvDashboardLabels(publicIntl('es'));
const clockLabels = { clockStopped: labels.clockStopped, clockAriaLabel: labels.clockAriaLabel };

const home = {
  entrantId: 'cit',
  name: 'Casa de Italia',
  abbreviation: 'CIT',
  score: 2,
  state: 'live' as const,
};
const away = {
  entrantId: 'ryz',
  name: 'Richet y Zapata',
  abbreviation: 'RYZ',
  score: 1,
  state: 'live' as const,
};

const live: LiveMatch = {
  matchId: 'm-live',
  stageNumber: 2,
  matchNumber: 5,
  stageOrdinal: 1,
  state: 'live',
  projectionVersion: 1,
  venueName: 'Cancha 1',
  sides: [home, away],
  clock: { segmentNumber: 1, elapsedSeconds: 754, running: true, asOf: '2026-11-23T13:12:34Z' },
};

const meta = {
  title: 'TV/Stream Widgets/TvLowerThird',
  component: TvLowerThird,
  args: {
    match: live,
    scope: 'Copa Oro · Semifinal',
    venueName: 'Cancha 1',
    statusTone: 'live',
    statusLabel: labels.resultState.live,
    labels,
    progress: tvMatchProgress(live, undefined, 'es'),
    clock: live.clock,
    clockLabels,
    locale: 'es',
  },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="tv-overlay-root tv-overlay-root--lower" style={{ height: '40vh' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TvLowerThird>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A match in play: both crests and names, the score, the game clock and the state on the band. */
export const Live: Story = {};

/** A match that has not started: the kickoff sits where the clock would be, and no score is shown. */
export const Upcoming: Story = {
  args: {
    match: {
      ...live,
      state: 'upcoming',
      scheduledAt: '2026-11-24T16:00:00.000Z',
      clock: undefined,
      sides: live.sides.map((side) => ({ ...side, state: 'upcoming', score: 0 })),
    },
    statusTone: 'upcoming',
    statusLabel: labels.resultState.upcoming,
    clock: undefined,
    progress: { sets: [] },
  },
};

/** A finished match: the final score and the final state, with no clock. */
export const Finished: Story = {
  args: {
    match: {
      ...live,
      state: 'final',
      clock: undefined,
      sides: [
        { ...home, score: 4, state: 'final' },
        { ...away, score: 3, state: 'final' },
      ],
    },
    statusTone: 'final',
    statusLabel: labels.resultState.final,
    clock: undefined,
    progress: { sets: [] },
  },
};

/** Long club names: the full name is shown where it fits, and the band never wraps onto a third row. */
export const LongNames: Story = {
  args: {
    match: {
      ...live,
      sides: [
        { ...home, name: 'Club Atlético Independiente de Villa Mercedes', score: 12 },
        {
          ...away,
          name: 'Asociación Civil Deportiva Universitaria del Litoral',
          score: 9,
        },
      ],
    },
  },
};
