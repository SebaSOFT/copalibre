import type { Meta, StoryObj } from '@storybook/react-vite';
import { publicIntl, tvDashboardLabels } from '../../../../lib/i18n/public-intl.js';
import type { LiveMatch } from '../../../../lib/live-state.js';
import { TvRecentResults } from './TvRecentResults.js';

const labels = tvDashboardLabels(publicIntl('es'));

const finished = (
  matchId: string,
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
): LiveMatch => ({
  matchId,
  stageNumber: 1,
  matchNumber: 1,
  stageOrdinal: 1,
  state: 'final',
  projectionVersion: 1,
  scheduledAt: '2026-11-18T18:00:00Z',
  sides: [
    {
      entrantId: `${matchId}-h`,
      name: home,
      abbreviation: home.slice(0, 3).toUpperCase(),
      score: homeScore,
      state: 'final',
    },
    {
      entrantId: `${matchId}-a`,
      name: away,
      abbreviation: away.slice(0, 3).toUpperCase(),
      score: awayScore,
      state: 'final',
    },
  ],
});

const meta = {
  title: 'TV/Kiosk & Full-Frame Widget/TvRecentResults',
  component: TvRecentResults,
  args: {
    groups: [
      {
        name: 'Lomas de Rivadavia',
        matches: [
          finished('m1', 'Lomas de Rivadavia', 'Club Hispano', 3, 1),
          finished('m2', 'Red Star', 'Lomas de Rivadavia', 0, 2),
        ],
      },
      { name: 'Club Hispano', matches: [finished('m3', 'Club Hispano', 'Uvt', 2, 2)] },
    ],
    emptyLabel: labels.noMatchesScheduled,
    locale: 'es',
    timeZone: 'America/Argentina/Mendoza',
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TvRecentResults>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};
export const Empty: Story = { args: { groups: [] } };
