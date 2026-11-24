import type { BracketMatch } from './bracket.js';
import {
  computeOverallPlaceOffsets,
  deriveOverallStandings,
  overallPlace,
} from './overall-standings.js';

function finalMatch(
  matchNumber: number,
  roundNumber: number,
  home: string,
  away: string,
  scores: readonly [number, number],
  options: {
    readonly nodeKey?: string;
    readonly role?: string;
    readonly branch?: string;
    readonly winnerEntrantId?: string;
  } = {},
): BracketMatch {
  return {
    matchNumber,
    roundNumber,
    branch: options.branch ?? 'winners',
    state: 'final',
    ...(options.nodeKey === undefined ? {} : { nodeKey: options.nodeKey }),
    ...(options.role === undefined ? {} : { role: options.role }),
    ...(options.winnerEntrantId === undefined ? {} : { winnerEntrantId: options.winnerEntrantId }),
    slots: [
      { kind: 'entrant', entrantId: home, name: home },
      { kind: 'entrant', entrantId: away, name: away },
    ],
    scores,
  };
}

describe('overallPlace and computeOverallPlaceOffsets', () => {
  it('computes 21 for 5th place with offset 16 (third band of three 8-entrant bands)', () => {
    const offsets = computeOverallPlaceOffsets(
      ['Copa Oro', 'Copa Plata', 'Copa Bronce'],
      [
        { zoneRef: 'Copa Oro', count: 8 },
        { zoneRef: 'Copa Plata', count: 8 },
        { zoneRef: 'Copa Bronce', count: 8 },
      ],
    );

    expect(offsets.get('Copa Oro')).toBe(0);
    expect(offsets.get('Copa Plata')).toBe(8);
    expect(offsets.get('Copa Bronce')).toBe(16);
    expect(overallPlace(5, offsets.get('Copa Bronce'))).toBe(21);
    expect(overallPlace(5, offsets.get('Copa Oro'))).toBe(5);
  });

  it('produces no offset when bands overlap or have gaps', () => {
    const overlapping = computeOverallPlaceOffsets(
      ['Copa Oro', 'Copa Plata'],
      [
        { zoneRef: 'Copa Oro', count: 8, firstSeed: 1, lastSeed: 8 },
        { zoneRef: 'Copa Plata', count: 8, firstSeed: 8, lastSeed: 15 },
      ],
    );
    expect(overlapping.size).toBe(0);

    const gapped = computeOverallPlaceOffsets(
      ['Copa Oro', 'Copa Plata'],
      [
        { zoneRef: 'Copa Oro', count: 8, firstSeed: 1, lastSeed: 8 },
        { zoneRef: 'Copa Plata', count: 8, firstSeed: 10, lastSeed: 17 },
      ],
    );
    expect(gapped.size).toBe(0);
    expect(overallPlace(5, undefined)).toBeUndefined();
  });
});

describe('deriveOverallStandings', () => {
  it('ranks finished banded zones by overall place and marks drawn placements as shared', () => {
    const rows = deriveOverallStandings([
      {
        zoneName: 'Copa Oro',
        overallPlaceOffset: 0,
        matches: [
          finalMatch(1, 1, 'Oro 1', 'Oro 4', [3, 1], { nodeKey: 'SE-R1-M1' }),
          finalMatch(2, 1, 'Oro 2', 'Oro 3', [2, 0], { nodeKey: 'SE-R1-M2' }),
          finalMatch(3, 2, 'Oro 1', 'Oro 2', [2, 1], { nodeKey: 'SE-R2-M1' }),
          finalMatch(4, 2, 'Oro 4', 'Oro 3', [1, 1], {
            nodeKey: 'placement-3',
            role: 'place-3',
            branch: 'placement',
          }),
        ],
      },
      {
        zoneName: 'Copa Plata',
        overallPlaceOffset: 4,
        matches: [
          finalMatch(1, 1, 'Plata 1', 'Plata 4', [2, 0], { nodeKey: 'SE-R1-M1' }),
          finalMatch(2, 1, 'Plata 2', 'Plata 3', [3, 2], { nodeKey: 'SE-R1-M2' }),
          finalMatch(3, 2, 'Plata 1', 'Plata 2', [1, 1], {
            nodeKey: 'SE-R2-M1',
            winnerEntrantId: 'Plata 2',
          }),
          finalMatch(4, 2, 'Plata 4', 'Plata 3', [2, 0], {
            nodeKey: 'placement-3',
            role: 'place-3',
            branch: 'placement',
          }),
        ],
      },
    ]);

    expect(rows.map((r) => [r.name, r.overallPlaceFrom, r.overallPlaceTo])).toEqual([
      ['Oro 1', 1, undefined],
      ['Oro 2', 2, undefined],
      ['Oro 3', 3, 4],
      ['Oro 4', 3, 4],
      ['Plata 2', 5, undefined],
      ['Plata 1', 6, undefined],
      ['Plata 4', 7, undefined],
      ['Plata 3', 8, undefined],
    ]);
  });

  it('returns nothing when a zone lacks an overallPlaceOffset or has unfinished matches', () => {
    expect(
      deriveOverallStandings([
        {
          zoneName: 'Copa Oro',
          matches: [finalMatch(1, 1, 'A', 'B', [1, 0], { nodeKey: 'SE-R1-M1' })],
        },
      ]),
    ).toEqual([]);

    expect(
      deriveOverallStandings([
        {
          zoneName: 'Copa Oro',
          overallPlaceOffset: 0,
          matches: [
            {
              ...finalMatch(1, 1, 'A', 'B', [1, 0], { nodeKey: 'SE-R1-M1' }),
              state: 'live',
            },
          ],
        },
      ]),
    ).toEqual([]);
  });

  it('groups entrants eliminated in earlier rounds without explicit placement matches and handles drawn finals', () => {
    const rows = deriveOverallStandings([
      {
        overallPlaceOffset: 8,
        matches: [
          {
            matchNumber: 1,
            roundNumber: 1,
            branch: 'winners',
            state: 'final',
            nodeKey: 'SE-R1-M1',
            slots: [
              {
                kind: 'entrant',
                entrantId: 'Alpha',
                name: 'Alpha',
                abbreviation: 'ALP',
                clubId: 'c1',
                emblemObjectId: 'e1',
              },
              { kind: 'entrant', entrantId: 'Beta', name: 'Beta' },
            ],
            scores: [2, 0],
          },
          finalMatch(2, 1, 'Gamma', 'Delta', [3, 1], { nodeKey: 'SE-R1-M2' }),
          finalMatch(3, 2, 'Alpha', 'Gamma', [1, 1], { nodeKey: 'SE-R2-M1' }),
        ],
      },
    ]);

    expect(rows.map((r) => [r.name, r.overallPlaceFrom, r.overallPlaceTo])).toEqual([
      ['Alpha', 9, 10],
      ['Gamma', 9, 10],
      ['Beta', 11, 12],
      ['Delta', 11, 12],
    ]);
    expect(rows[0]).toMatchObject({
      abbreviation: 'ALP',
      clubId: 'c1',
      emblemObjectId: 'e1',
    });
  });
});
