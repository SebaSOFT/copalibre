import type { Meta, StoryObj } from '@storybook/react-vite';
import { tvOrganismStoryArgs } from './tv-organism-story-args.js';
import { TvFocalPanel } from './TvFocalPanel.js';
import { tvMatchProgress } from '../../lib/tv-match-progress.js';

const meta = {
  title: 'TV/Kiosk Monitor/TvFocalPanel',
  component: TvFocalPanel,
  args: {
    ...tvOrganismStoryArgs,
    tournamentName: 'Copa de Otoño',
    showRecap: false,
    isRotatingDashboard: true,
    showZoneChampions: false,
    allFinal: false,
    champion: undefined,
    winnerZones: [],
    liveMatchEvents: [],
    initialMatchEventIds: [],
    isOverlayPresentation: false,
    pinnedMissing: false,
    pinnedStageLabel: '1 · 7',
    noMatchMessage: 'Sin partidos programados',
    isMatchDelayed: () => false,
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TvFocalPanel>;
export default meta;

type Story = StoryObj<typeof meta>;

/** The spotlight match, its counters, clock and segment state. */
export const Spotlight: Story = {};

/** A pinned route whose match does not exist: the panel says so and does not show another match. */
export const PinnedMissing: Story = {
  args: {
    spotlightMatch: undefined,
    progress: tvMatchProgress(undefined, undefined, 'es'),
    pinnedMissing: true,
  },
};
