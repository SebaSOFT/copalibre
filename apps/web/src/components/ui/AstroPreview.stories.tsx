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
 * A tournament with nothing to report.
 *
 * The rail keeps its height and says so, rather than collapsing to a gap the
 * page below then jumps into the moment the first fixture arrives.
 */
export const ScoreTickerEmpty: Story = {
  args: { component: 'score-ticker-empty', height: 140 },
};

/**
 * The last known scores, stated as such.
 *
 * The one thing this component must never do is present an old score as a
 * current one, so the condition is on the rail rather than inferred from a
 * clock that stopped moving.
 */
export const ScoreTickerStale: Story = {
  args: { component: 'score-ticker-stale', height: 140 },
};

/**
 * The public header, and the reason it is worth framing rather than imitating.
 *
 * With the frame below 768px the menu expands into the page: the content
 * beneath it moves down instead of being covered. Reload with JavaScript
 * disabled and the navigation is simply already open, which is the state the
 * markup ships in.
 */
export const PublicHeader: Story = {
  args: { component: 'public-header', height: 360 },
};

/**
 * The bracket stage over the eight-entrant fixture.
 *
 * Below 768px the graph gives way to the textual round-and-branch view, which
 * carries the same seeds, sources and outcomes rather than a reduced set of
 * them — switch the workbench viewport to 374px to read it.
 */
export const BracketStage: Story = {
  args: { component: 'bracket-stage', height: 640 },
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
