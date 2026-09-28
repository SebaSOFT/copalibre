import type { Meta, StoryObj } from '@storybook/react-vite';
import { publicIntl, tvMultiCourtGridLabels } from '../../lib/i18n/public-intl.js';
import type { LiveDashboard, LiveMatch } from '../../lib/live-state.js';
import { TvMultiCourtGrid } from './TvMultiCourtGrid.js';

function liveMatch(overrides: Partial<LiveMatch> & { readonly matchId: string }): LiveMatch {
  return {
    stageNumber: 1,
    matchNumber: 1,
    state: 'live',
    projectionVersion: 1,
    clockSeconds: 32 * 60,
    sides: [
      {
        entrantId: 'home',
        name: 'Club Atlético River',
        abbreviation: 'RIV',
        score: 1,
        state: 'live',
      },
      { entrantId: 'away', name: 'Deportivo Andes', abbreviation: 'AND', score: 1, state: 'live' },
    ],
    ...overrides,
  };
}

function dashboard(matches: readonly LiveMatch[]): LiveDashboard {
  return { matches, standingsVersion: 1, usingLastKnown: false };
}

const labels = tvMultiCourtGridLabels(publicIntl('es'));

const meta = {
  title: 'TV/Kiosk Monitor/TvMultiCourtGrid',
  component: TvMultiCourtGrid,
  args: {
    streamPath: '/stories/no-stream',
    resultStateLabels: labels.resultState,
    noMatchesLabel: labels.noMatches,
    ariaLabel: labels.ariaLabel,
    venueNameByMatchId: {
      'match-1': 'Cancha 1',
      'match-2': 'Cancha 2',
      'match-3': 'Cancha 3',
      'match-4': 'Cancha 4',
      'match-5': 'Cancha 5',
      'match-6': 'Cancha 6',
    },
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TvMultiCourtGrid>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TwoCourts: Story = {
  args: {
    gridSize: 2,
    initial: dashboard([
      liveMatch({ matchId: 'match-1' }),
      liveMatch({ matchId: 'match-2', matchNumber: 2, clockSeconds: 18 * 60 }),
    ]),
  },
};

export const FourCourts: Story = {
  args: {
    gridSize: 4,
    initial: dashboard([
      liveMatch({ matchId: 'match-1' }),
      liveMatch({ matchId: 'match-2', matchNumber: 2, clockSeconds: 18 * 60 }),
      liveMatch({ matchId: 'match-3', matchNumber: 3, clockSeconds: 44 * 60 }),
      liveMatch({ matchId: 'match-4', matchNumber: 4, clockSeconds: 9 * 60 }),
    ]),
  },
};

export const SixCourts: Story = {
  args: {
    gridSize: 6,
    initial: dashboard([
      liveMatch({ matchId: 'match-1' }),
      liveMatch({ matchId: 'match-2', matchNumber: 2, clockSeconds: 18 * 60 }),
      liveMatch({ matchId: 'match-3', matchNumber: 3, clockSeconds: 44 * 60 }),
      liveMatch({ matchId: 'match-4', matchNumber: 4, clockSeconds: 9 * 60 }),
      liveMatch({ matchId: 'match-5', matchNumber: 5, clockSeconds: 55 * 60 }),
      liveMatch({ matchId: 'match-6', matchNumber: 6, clockSeconds: 3 * 60 }),
    ]),
  },
};

export const NoLiveMatches: Story = {
  args: { gridSize: 'auto', initial: dashboard([]) },
};
