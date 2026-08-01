import type { BracketMatch } from './bracket.js';

/** A double-elimination shape: two branches and a grand final still undecided. */
export function sampleBracket(): readonly BracketMatch[] {
  return [
    {
      matchNumber: 1,
      roundNumber: 1,
      branch: 'winners',
      state: 'final',
      slots: [
        { kind: 'entrant', name: 'Talleres de Mendoza', abbreviation: 'TLL A' },
        { kind: 'entrant', name: 'Casa de Italia', abbreviation: 'C I' },
      ],
      scores: [3, 1],
    },
    {
      matchNumber: 2,
      roundNumber: 1,
      branch: 'winners',
      state: 'live',
      slots: [
        { kind: 'entrant', name: 'Independiente Rivadavia' },
        { kind: 'entrant', name: 'Club Atlético San Martín' },
      ],
      scores: [1, 1],
    },
    {
      matchNumber: 3,
      roundNumber: 1,
      branch: 'losers',
      state: 'tbd',
      slots: [
        { kind: 'loser-of', matchNumber: 1 },
        { kind: 'loser-of', matchNumber: 2 },
      ],
    },
    {
      matchNumber: 4,
      roundNumber: 1,
      branch: 'final',
      state: 'tbd',
      slots: [
        { kind: 'winner-of', matchNumber: 2 },
        { kind: 'winner-of', matchNumber: 3 },
      ],
    },
  ];
}
