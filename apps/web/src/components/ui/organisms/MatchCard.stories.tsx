import type { Meta, StoryObj } from '@storybook/react-vite';
import { MatchCard } from './MatchCard.js';
import { matchCardLabels, publicIntl } from '../../../lib/i18n/public-intl.js';
import type { MatchCardData } from '../../../lib/matches-view.js';
import type { SupportedLanguage } from '../../../lib/language-preference.js';

/**
 * `MatchCard` takes its labels pre-formatted rather than importing react-intl
 * itself, so the workbench builds them the way the Astro page does — through
 * `publicIntl(locale)` — with the locale coming from the toolbar. The public
 * surface has its own catalogue (`public-messages.*`), separate from the
 * operator panel's, and this is the one that applies here.
 */
function labelsFor(locale: SupportedLanguage) {
  return matchCardLabels(publicIntl(locale));
}

const BASE: MatchCardData = {
  matchId: 'm-1',
  stageNumber: 1,
  matchNumber: 7,
  state: 'live',
  homeName: 'Club Atlético Independiente',
  homeAbbreviation: 'CAI',
  homeScore: 2,
  awayName: 'Deportivo San Juan',
  awayAbbreviation: 'DSJ',
  awayScore: 1,
  clockSeconds: 4726,
  venueName: 'Estadio del Bicentenario',
  zoneName: 'Zona A',
  groupName: 'Grupo 1',
};

const meta = {
  title: 'Public/MatchCard',
  component: MatchCard,
  args: { match: BASE, labels: labelsFor('en') },
  /*
   * Rendered in the grid it actually ships inside.
   *
   * `matches.astro` and `MatchesViewRoute` both place this card in
   * `.cl-matches-view__grid`, so a bare story showed it 1408px wide at desktop
   * — four times its real width, and nothing like the 343px it occupies beside
   * its siblings. A card reviewed at a width it never has is a card reviewed
   * against the wrong constraints.
   */
  decorators: [
    (Story) => (
      <div className="cl-matches-view__grid">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MatchCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Live: Story = {
  render: (_args, context) => (
    <MatchCard labels={labelsFor(context.globals.locale as SupportedLanguage)} match={BASE} />
  ),
};

export const Upcoming: Story = {
  render: (_args, context) => (
    <MatchCard
      labels={labelsFor(context.globals.locale as SupportedLanguage)}
      match={{
        ...BASE,
        state: 'upcoming',
        homeScore: undefined,
        awayScore: undefined,
        clockSeconds: undefined,
      }}
    />
  ),
};

export const Final: Story = {
  render: (_args, context) => (
    <MatchCard
      labels={labelsFor(context.globals.locale as SupportedLanguage)}
      match={{ ...BASE, state: 'final', clockSeconds: undefined, homePosition: 1, awayPosition: 4 }}
    />
  ),
};

/** A tie broken by a declared factor rather than by score. */
export const WithDecidingFactor: Story = {
  render: (_args, context) => (
    <MatchCard
      labels={labelsFor(context.globals.locale as SupportedLanguage)}
      match={{
        ...BASE,
        state: 'final',
        homeScore: 1,
        awayScore: 1,
        clockSeconds: undefined,
        decidingFactor: 'Penales 4-3',
      }}
    />
  ),
};

/** A best-of series, where the card summarises segments rather than one result. */
export const WithSeries: Story = {
  render: (_args, context) => (
    <MatchCard
      labels={labelsFor(context.globals.locale as SupportedLanguage)}
      match={{
        ...BASE,
        state: 'live',
        series: {
          span: 3,
          resolutionClass: 'best-of',
          games: [
            { number: 1, status: 'finalized', winner: 'home', scores: [25, 20] },
            { number: 2, status: 'finalized', winner: 'away', scores: [18, 25] },
            { number: 3, status: 'in-progress', scores: [11, 9] },
          ],
          homeGamesWon: 1,
          awayGamesWon: 1,
          status: 'undecided',
          explanation: 'Serie al mejor de 3, empatada 1-1.',
        },
      }}
    />
  ),
};

/**
 * Nothing decided yet: no entrants, no scores. The card that a bracket shows
 * before its feeding matches resolve, and the one hardest to reach in the app.
 */
export const ToBeDecided: Story = {
  render: (_args, context) => (
    <MatchCard
      labels={labelsFor(context.globals.locale as SupportedLanguage)}
      match={{
        matchId: 'm-2',
        stageNumber: 2,
        matchNumber: 1,
        state: 'tbd',
        homeName: undefined,
        awayName: undefined,
      }}
    />
  ),
};
