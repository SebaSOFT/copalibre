import type { Meta, StoryObj } from '@storybook/react-vite';
import { tvOrganismStoryArgs } from '../../tv-organism-story-args.js';
import { TvOverlayScene } from './TvOverlayScene.js';
import { tvMatchProgress } from '../../../../lib/tv-match-progress.js';

const meta = {
  title: 'TV/Stream Widgets/TvOverlayScene',
  component: TvOverlayScene,
  args: {
    ...tvOrganismStoryArgs,
    presentation: 'lower',
    hydrated: true,
    noMatchMessage: 'No hay partido en esta cancha',
    showStaleMark: false,
    broadcastAlertBanner: null,
    scope: undefined,
    isMatchDelayed: () => false,
  },
  parameters: { layout: 'fullscreen', backgrounds: { default: 'bright football field' } },
} satisfies Meta<typeof TvOverlayScene>;
export default meta;

type Story = StoryObj<typeof meta>;

/** The lower third over footage: names, score and state of the one match. */
export const Lower: Story = {};

/** The corner score bug over footage. */
export const Scorebug: Story = { args: { presentation: 'scorebug' } };

/** No match on this court: the overlay paints nothing and says so to assistive tech. */
export const NoMatch: Story = {
  args: { spotlightMatch: undefined, progress: tvMatchProgress(undefined, undefined, 'es') },
};
