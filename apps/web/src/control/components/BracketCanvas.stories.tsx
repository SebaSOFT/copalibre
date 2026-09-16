import { useState } from 'react';
import { referenceJourneyBracket, REFERENCE_ENTRANTS } from '../../lib/reference-fixtures.js';
import type { CanvasMatch } from '../lib/bracket-canvas.js';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { BracketCanvas } from './BracketCanvas.js';
import {
  bracket,
  focusableBracket,
  fullyLinkedBracket,
  ids,
  mixedBracket,
} from './screen-story-fixtures.js';

const matchUrl = (persistedMatchId: string): string =>
  `/control/liga-mendocina/tournaments/apertura-2026/matches/${persistedMatchId}`;

const meta = {
  title: 'Admin/Screens/BracketCanvas',
  component: BracketCanvas,
  args: { matches: bracket, zoom: 1, onZoomChange: () => undefined },
} satisfies Meta<typeof BracketCanvas>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loaded: Story = {};
export const Empty: Story = { args: { matches: [] } };
export const Zoomed: Story = { args: { zoom: 1.5 } };

/** A mix of linked (persisted) and pending nodes — round one links out, the final doesn't yet. */
export const MixedLinkedAndPending: Story = { args: { matches: mixedBracket, matchUrl } };

/** Every node in the round links to its match console — nothing left pending. */
export const FullyLinkedRound: Story = { args: { matches: fullyLinkedBracket, matchUrl } };

/** Focused on an early, round-one match — scrolled into view and given the emphasis border. */
export const FocusedOnEarlyMatch: Story = {
  args: { focusMatchId: ids.match, matches: focusableBracket, matchUrl },
};

/** Focused on the round-two final — the same emphasis, later in the structure. */
export const FocusedOnLateMatch: Story = {
  args: { focusMatchId: ids.matchThree, matches: focusableBracket, matchUrl },
};

/** A focus target absent from the structure — renders normally, nothing emphasized, no error. */
export const FocusedOnUnrecognizedMatch: Story = {
  args: { focusMatchId: 'does-not-exist', matches: focusableBracket, matchUrl },
};

const inProgressSeriesMatches: readonly CanvasMatch[] = [
  {
    matchId: 'SF-M1',
    bracket: 'winners',
    round: 1,
    position: 1,
    status: 'in-progress',
    format: 'BO3',
    slots: [
      { kind: 'entrant', entrantId: ids.first, score: 1 },
      { kind: 'entrant', entrantId: ids.second, score: 0 },
    ],
    series: {
      span: 3,
      resolutionClass: 'best-of',
      status: 'undecided',
      homeGamesWon: 1,
      awayGamesWon: 0,
      explanation: 'Best-of-3 series stands at 1-0',
      games: [
        { number: 1, status: 'finalized', winner: 'home', scores: [2, 1] },
        { number: 2, status: 'scheduled' },
        { number: 3, status: 'scheduled' },
      ],
    },
  },
];

const decidedSeriesMatches: readonly CanvasMatch[] = [
  {
    matchId: 'SF-M2',
    bracket: 'winners',
    round: 1,
    position: 2,
    status: 'finalized',
    format: 'BO3',
    slots: [
      { kind: 'entrant', entrantId: ids.third, score: 2 },
      { kind: 'entrant', entrantId: ids.fourth, score: 0 },
    ],
    series: {
      span: 3,
      resolutionClass: 'best-of',
      status: 'decided',
      winner: 'home',
      winnerEntrantId: ids.third,
      homeGamesWon: 2,
      awayGamesWon: 0,
      explanation: 'Best-of-3 series won by home (2-0)',
      games: [
        { number: 1, status: 'finalized', winner: 'home', scores: [3, 0] },
        { number: 2, status: 'finalized', winner: 'home', scores: [2, 1] },
        { number: 3, status: 'not-required' },
      ],
    },
  },
];

const noSeriesMatches: readonly CanvasMatch[] = [
  {
    matchId: 'SF-M3',
    bracket: 'winners',
    round: 1,
    position: 3,
    status: 'scheduled',
    slots: [
      { kind: 'entrant', entrantId: ids.first },
      { kind: 'entrant', entrantId: ids.second },
    ],
  },
];

/** A node with an in-progress series (game 1 won, games 2 and 3 remaining). */
export const SeriesInProgress: Story = { args: { matches: inProgressSeriesMatches } };

/** A node with a decided series showing anulled leg 3 after a 2-0 sweep in a best-of-3. */
export const SeriesDecidedWithAnulledLegs: Story = {
  args: { matches: decidedSeriesMatches },
};

/** A node with no series declared (unaffected, for contrast). */
export const NoSeriesDeclared: Story = { args: { matches: noSeriesMatches } };

const journeyMatches = (complete: boolean): readonly CanvasMatch[] =>
  referenceJourneyBracket(complete).map((match) => ({
    matchId: String(match.matchNumber),
    bracket: match.branch,
    round: match.roundNumber,
    position: match.matchNumber,
    status: match.state,
    slots: match.slots.map((slot, index) => ({
      kind: slot.kind === 'seed' ? 'bye' : slot.kind,
      entrantId: slot.kind === 'entrant' ? slot.entrantId : undefined,
      matchId:
        slot.kind === 'winner-of' || slot.kind === 'loser-of'
          ? String(slot.matchNumber)
          : undefined,
      score: match.scores?.[index],
    })),
  }));
const journeyNames = Object.fromEntries(
  REFERENCE_ENTRANTS.map((entrant) => [entrant.id, entrant.name]),
);
function JourneyStory(args: React.ComponentProps<typeof BracketCanvas>): React.JSX.Element {
  const [selected, setSelected] = useState(args.highlightEntrantId);
  return (
    <BracketCanvas
      {...args}
      highlightEntrantId={selected}
      onHighlightEntrant={setSelected}
      names={journeyNames}
    />
  );
}
export const EntrantJourneyAlive: Story = {
  args: { matches: journeyMatches(false), highlightEntrantId: REFERENCE_ENTRANTS[0].id },
  render: JourneyStory,
};
export const EntrantJourneyChampion: Story = {
  args: { matches: journeyMatches(true), highlightEntrantId: REFERENCE_ENTRANTS[0].id },
  render: JourneyStory,
};
export const EntrantJourneyEliminated: Story = {
  args: { matches: journeyMatches(false), highlightEntrantId: REFERENCE_ENTRANTS[7].id },
  render: JourneyStory,
};
