import type { Meta, StoryObj } from '@storybook/react-vite';
import { TvLeagueFixtures } from './TvLeagueFixtures.js';
import type { BracketZone } from '../../../../lib/bracket-projection.js';
import { publicIntl, tvDashboardLabels } from '../../../../lib/i18n/public-intl.js';

const match = (
  matchNumber: number,
  roundNumber: number,
  home: [string, string],
  away: [string, string],
  scores?: [number, number],
): BracketZone['matches'][number] => ({
  matchId: `league-${matchNumber}`,
  matchNumber,
  roundNumber,
  branch: 'winners',
  state: scores ? 'final' : 'upcoming',
  ...(scores ? { scores } : {}),
  slots: [
    { kind: 'entrant', entrantId: `${home[1]}`, name: home[0], abbreviation: home[1] },
    { kind: 'entrant', entrantId: `${away[1]}`, name: away[0], abbreviation: away[1] },
  ],
});

const LEAGUE_ZONE: BracketZone = {
  zoneId: 'zone-league',
  zoneName: 'Liga A',
  matches: [
    match(1, 1, ['Club Atlético Independiente', 'CAI'], ['Deportivo San Juan', 'DSJ'], [3, 1]),
    match(2, 1, ['Sportivo Desamparados', 'SDE'], ['Atlético Concepción', 'ACO'], [0, 0]),
    match(3, 2, ['Club Atlético Independiente', 'CAI'], ['Sportivo Desamparados', 'SDE']),
  ],
};

const meta = {
  title: 'TV/Kiosk & Full-Frame Widget/TvLeagueFixtures',
  component: TvLeagueFixtures,
  args: {
    labels: tvDashboardLabels(publicIntl('es')),
    zones: [LEAGUE_ZONE],
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TvLeagueFixtures>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};

/** Two league zones keep their matches apart under their own headings. */
export const TwoZones: Story = {
  args: {
    zones: [
      LEAGUE_ZONE,
      {
        zoneId: 'zone-league-b',
        zoneName: 'Liga B',
        matches: [match(1, 1, ['Villa Krause', 'VKR'], ['Rivadavia', 'RIV'], [2, 2])],
      },
    ],
  },
};
