import type { Meta, StoryObj } from '@storybook/react-vite';
import { tvOrganismStoryArgs } from './tv-organism-story-args.js';
import { TvPresentationLayout } from './TvPresentationLayout.js';
import { tvMatchProgress } from '../../lib/tv-match-progress.js';

const meta = {
  title: 'TV/Kiosk Monitor/TvPresentationLayout',
  component: TvPresentationLayout,
  args: { ...tvOrganismStoryArgs, leadingSide: undefined, venueOf: () => 'Cancha 1' },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TvPresentationLayout>;
export default meta;

type Story = StoryObj<typeof meta>;

/** The focal match, its bracket and standings, and the next-match strip. */
export const Loaded: Story = { args: { leadingSide: 'home' } };

/** No match to focus: the focal panel and the next-match strip both state that nothing is scheduled. */
export const Empty: Story = {
  args: { spotlightMatch: undefined, progress: tvMatchProgress(undefined, undefined, 'es') },
};
