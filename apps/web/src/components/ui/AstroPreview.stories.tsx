import type { Meta, StoryObj } from '@storybook/react-vite';
import { AstroPreview } from './AstroPreview.js';

/**
 * The seam that makes a server-rendered component reviewable.
 *
 * Every story here frames the production Astro component through the production
 * renderer. Nothing below re-creates markup: if a component changes, these
 * change with it, which is the whole reason the seam exists rather than a set
 * of React look-alikes.
 *
 * They need `yarn workspace @copalibre/web dev` running. Without it each story
 * says so and names the command, rather than showing an empty frame.
 */
const meta = {
  title: 'Public/Astro preview',
  component: AstroPreview,
  render: (args, context) => (
    <AstroPreview {...args} locale={args.locale ?? context.globals.locale ?? 'en'} />
  ),
  parameters: {
    docs: {
      description: {
        component:
          'Frames /__preview/<id> from the Astro dev server. The route exists only in development and answers 404 in a build, so nothing here can reach production.',
      },
    },
  },
} satisfies Meta<typeof AstroPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The legend, whose colours mean nothing without the labels beside them. */
export const ResultLegend: Story = {
  args: { component: 'result-legend', height: 220 },
};

/** The same legend in Spanish, rendered by the catalogue the app itself loads. */
export const ResultLegendSpanish: Story = {
  args: { component: 'result-legend', locale: 'es', height: 220 },
};

/** The ticker over the canonical group results. */
export const ScoreTicker: Story = {
  args: { component: 'score-ticker', height: 140 },
};

/**
 * An id the route does not allowlist.
 *
 * It renders the unavailable state rather than an empty frame — the same state a
 * reviewer sees when the dev server is not running, which is the one failure
 * this seam has to report honestly.
 */
export const UnknownComponent: Story = {
  args: { component: 'not-a-component', height: 220 },
};
