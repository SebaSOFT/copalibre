import type { IntlShape } from 'react-intl';
import { bracketBranchLabel } from './i18n/public-intl.js';
import { messages } from './i18n/public-messages.en.js';
import type { BracketRound } from './bracket.js';

/** Names a round with its branch context for its accessible region. */
export function bracketRoundHeading(
  intl: IntlShape,
  round: BracketRound,
  rounds: readonly BracketRound[],
): string {
  const heading = bracketRoundTitle(intl, round, rounds);
  return `${bracketBranchLabel(intl, round.branch)} · ${heading}`;
}

/** Names a round without repeating its branch subtitle beside every round. */
export function bracketRoundTitle(
  intl: IntlShape,
  round: BracketRound,
  rounds: readonly BracketRound[],
): string {
  const branchRounds = rounds
    .filter((candidate) => candidate.branch === round.branch)
    .sort((left, right) => left.roundNumber - right.roundNumber);
  const index = branchRounds.findIndex((candidate) => candidate.roundNumber === round.roundNumber);
  const roundsRemaining = branchRounds.length - index;
  const heading =
    roundsRemaining === 1
      ? intl.formatMessage(messages.bracketRoundFinal)
      : roundsRemaining === 2
        ? intl.formatMessage(messages.bracketRoundSemifinals)
        : roundsRemaining === 3
          ? intl.formatMessage(messages.bracketRoundQuarterfinals)
          : intl.formatMessage(messages.bracketRoundHeading, { round: round.roundNumber });

  return heading;
}
