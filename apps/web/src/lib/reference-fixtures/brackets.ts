/** Bracket fixtures: knockout, journey and placement brackets. */

import type { BracketMatch } from '../bracket.js';
import { REFERENCE_ENTRANTS } from './entrants.ts';

/**
 * Eight entrants, single elimination: four quarter-finals decided, two
 * semi-finals following from them, and a final still pending its sources.
 *
 * Every advancing slot names the match it came from. Nothing advances because
 * of its score alone, which is the rule the composition must not break either.
 */
export function referenceBracket(): readonly BracketMatch[] {
  const e = REFERENCE_ENTRANTS;
  const pair = (a: number, b: number) =>
    [
      { kind: 'entrant', entrantId: e[a].id, name: e[a].name, abbreviation: e[a].abbreviation },
      { kind: 'entrant', entrantId: e[b].id, name: e[b].name, abbreviation: e[b].abbreviation },
    ] as const;
  return [
    {
      matchNumber: 1,
      roundNumber: 1,
      branch: 'winners',
      state: 'final',
      slots: pair(0, 7),
      scores: [2, 0],
    },
    {
      matchNumber: 2,
      roundNumber: 1,
      branch: 'winners',
      state: 'final',
      slots: pair(3, 4),
      scores: [1, 3],
    },
    {
      matchNumber: 3,
      roundNumber: 1,
      branch: 'winners',
      state: 'final',
      slots: pair(2, 5),
      scores: [2, 1],
    },
    {
      matchNumber: 4,
      roundNumber: 1,
      branch: 'winners',
      state: 'final',
      slots: pair(1, 6),
      scores: [4, 2],
    },
    {
      matchNumber: 5,
      roundNumber: 2,
      branch: 'winners',
      state: 'upcoming',
      slots: [
        { kind: 'winner-of', matchNumber: 1 },
        { kind: 'winner-of', matchNumber: 2 },
      ],
    },
    {
      matchNumber: 6,
      roundNumber: 2,
      branch: 'winners',
      state: 'upcoming',
      slots: [
        { kind: 'winner-of', matchNumber: 3 },
        { kind: 'winner-of', matchNumber: 4 },
      ],
    },
    {
      matchNumber: 7,
      roundNumber: 3,
      branch: 'winners',
      state: 'upcoming',
      slots: [
        { kind: 'winner-of', matchNumber: 5 },
        { kind: 'winner-of', matchNumber: 6 },
      ],
    },
  ];
}

/** Journey review: the same eight-entrant bracket, optionally completed. */
export function referenceJourneyBracket(complete = false): readonly BracketMatch[] {
  const bracket = referenceBracket();
  if (!complete) return bracket;
  const slot = (index: number) => ({
    kind: 'entrant' as const,
    entrantId: REFERENCE_ENTRANTS[index].id,
    name: REFERENCE_ENTRANTS[index].name,
  });
  return bracket.map((match) => {
    if (match.matchNumber === 5)
      return { ...match, state: 'final' as const, slots: [slot(0), slot(4)], scores: [3, 1] };
    if (match.matchNumber === 6)
      return { ...match, state: 'final' as const, slots: [slot(2), slot(1)], scores: [1, 2] };
    if (match.matchNumber === 7)
      return { ...match, state: 'final' as const, slots: [slot(0), slot(1)], scores: [2, 1] };
    return match;
  });
}

/** The reference bracket with its two semi-final losers' third-place game, drawn as a placement branch. */
export function referencePlacementBracket(): readonly BracketMatch[] {
  const bracket = referenceJourneyBracket(true);
  const semiLosers = bracket
    .filter((match) => match.roundNumber === 2)
    .map((match) => match.matchNumber);
  return [
    ...bracket,
    {
      matchNumber: 8,
      roundNumber: 3,
      position: 1,
      role: 'place-3',
      branch: 'placement',
      state: 'final',
      slots: [
        { kind: 'loser-of', matchNumber: semiLosers[0] },
        { kind: 'loser-of', matchNumber: semiLosers[1] },
      ],
      scores: [1, 0],
    },
  ];
}
