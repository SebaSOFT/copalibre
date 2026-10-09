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

/** The production podium with an explicit third place and a shared title. */
export const ChampionPodiumLoaded: Story = {
  args: { component: 'champion-podium', height: 420 },
};

export const ChampionPodiumSharedTitle: Story = {
  args: { component: 'champion-podium-shared-title', height: 260 },
};

/** Organization › tournament › current stage: every ancestor a link, the page itself plain text. */
export const BreadcrumbTrail: Story = {
  args: { component: 'breadcrumb', height: 120 },
};

/** Five levels; below 768px the first and the last two stay and the middle folds behind an ellipsis link. */
export const BreadcrumbCollapsed: Story = {
  args: { component: 'breadcrumb-collapsed', height: 120 },
};

/** The compact club filter: initials stand in without an emblem, and the selected chip carries a check and a fill. */
export const ClubFilterChips: Story = {
  args: { component: 'club-filter-chip', height: 120 },
};

/**
 * Abbreviated headers carry their full wording (hover or focus a header; the legend below the table
 * repeats it for touch), and the club filter is a row of compact chips: emblem or initials, selected
 * state by fill, border and check.
 */
export const StandingsTableHints: Story = {
  args: { component: 'standings-table', height: 760 },
};

/** A podium squeezed into a quarter-width card stacks its placings instead of breaking names. */
export const ChampionPodiumNarrow: Story = {
  args: { component: 'champion-podium-narrow', height: 760 },
};

/** Between the stacked and the three-column layouts the placings still read in one column. */
export const ChampionPodiumMedium: Story = {
  args: { component: 'champion-podium-medium', height: 640 },
};

/** A finished listing card with a long tournament name at the width of a three-up grid. */
export const TournamentCardFinishedNarrow: Story = {
  args: { component: 'tournament-card-finished-narrow', height: 640 },
};

export const ChampionPodiumEmpty: Story = {
  args: { component: 'champion-podium-empty', height: 220 },
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
 * Public spectator navigation: Home and locale selection, without operator help.
 *
 * With the frame below 768px the menu expands into the page: the content
 * beneath it moves down instead of being covered. Reload with JavaScript
 * disabled and the navigation is simply already open, which is the state the
 * markup ships in.
 */
export const PublicHeader: Story = {
  args: { component: 'public-header', height: 360 },
};

/** A 4:5 transparent emblem contained within a square chamfer-safe frame. */
export const EmblemImage: Story = {
  args: { component: 'emblem-image', height: 180 },
};

/** The `bare` emblem: no background, border, chamfer or inset, only the 1:1 image for inline use. */
export const EmblemImageBare: Story = {
  args: { component: 'emblem-image-bare', height: 120 },
};

/** The same emblem at three `size` values; every frame remains square. */
export const EmblemImageMatrix: Story = {
  args: { component: 'emblem-image-matrix', height: 200 },
};

/** A transparent portrait remains contained in the separate 4:5 photo frame. */
export const PersonPhotoCutout: Story = {
  args: { component: 'person-photo-cutout', height: 300 },
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

/** The condensed bracket-context panel, emphasizing an early, already-resolved match. */
export const MatchBracketContextEarly: Story = {
  args: { component: 'match-bracket-context-early', height: 420 },
};

/** The same panel emphasizing the championship match — winner-of slots still pending. */
export const MatchBracketContextChampionship: Story = {
  args: { component: 'match-bracket-context-championship', height: 420 },
};

/**
 * A focus target the structure does not contain.
 *
 * Renders exactly like an unfocused canvas — no node emphasized, no error — the same
 * contract `BracketCanvas`'s control-side focus mode makes.
 */
export const MatchBracketContextUnknownFocus: Story = {
  args: { component: 'match-bracket-context-unknown-focus', height: 420 },
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

/** A zone with a third-place game: the final in the middle with a half on each side, the game listed beneath. */
export const BracketPlacementGame: Story = {
  args: { component: 'bracket-placement', height: 900 },
};

/** The whole bracket at the compact density a narrow screen draws. */
export const BracketGraphCompact: Story = {
  args: { component: 'bracket-graph', height: 420 },
};

/** The card a bracket draws on a narrow screen: abbreviations and scores only. */
export const MatchNodeCompactCard: Story = {
  args: { component: 'match-node-compact', height: 120 },
};

/** The placement games listed under what each decides, the current one marked. */
export const PlacementGamesList: Story = {
  args: { component: 'placement-games', height: 260 },
};

export const BracketJourneyAlive: Story = {
  args: { component: 'bracket-journey-alive', height: 640 },
};
export const BracketJourneyChampion: Story = {
  args: { component: 'bracket-journey-champion', height: 640 },
};
export const BracketJourneyEliminated: Story = {
  args: { component: 'bracket-journey-eliminated', height: 640 },
};
