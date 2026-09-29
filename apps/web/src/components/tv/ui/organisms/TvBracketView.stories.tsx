import type { Meta, StoryObj } from '@storybook/react-vite';
import { TvBracketView } from './TvBracketView.js';
import type { BracketZone } from '../../../../lib/bracket-projection.js';
import { publicIntl, tvDashboardLabels } from '../../../../lib/i18n/public-intl.js';

const RESOLVED_MATCH: BracketZone['matches'][number] = {
  matchId: 'bracket-final',
  matchNumber: 1,
  roundNumber: 1,
  branch: 'winners',
  state: 'final',
  scores: [3, 1],
  slots: [
    { kind: 'entrant', entrantId: 'e-1', name: 'Club Atlético Independiente', abbreviation: 'CAI' },
    { kind: 'entrant', entrantId: 'e-2', name: 'Deportivo San Juan', abbreviation: 'DSJ' },
  ],
};

const PENDING_MATCH: BracketZone['matches'][number] = {
  matchId: 'bracket-next',
  matchNumber: 2,
  roundNumber: 2,
  branch: 'winners',
  state: 'upcoming',
  slots: [
    { kind: 'winner-of', matchNumber: 1 },
    { kind: 'winner-of', matchNumber: 3 },
  ],
};

const ZONES: readonly BracketZone[] = [
  { zoneId: 'zone-a', zoneName: 'Zona A', matches: [RESOLVED_MATCH, PENDING_MATCH] },
];

const meta = {
  title: 'TV/Kiosk & Full-Frame Widget/TvBracketView',
  component: TvBracketView,
  args: {
    labels: tvDashboardLabels(publicIntl('es')),
    zones: ZONES,
  },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TvBracketView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};

/** A pending slot names its source match rather than rendering blank. */
export const UnresolvedSlots: Story = {
  args: {
    zones: [{ zoneId: 'zone-a', zoneName: 'Zona A', matches: [PENDING_MATCH] }],
  },
};
