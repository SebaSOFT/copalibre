import { fixtureDescriptor } from '../test-support/fixture-descriptor.js';
import { validateRecordedOutcome } from './outcome-validation.js';

const tennis = fixtureDescriptor({
  descriptorId: '01890000-0000-7000-8000-0000000000t1',
  version: '1.0.0',
  name: 'Court Duel',
  statistics: [
    { code: 'matches-won', label: 'Matches won', aggregation: 'sum' },
    { code: 'sets-won', label: 'Sets won', aggregation: 'sum' },
    { code: 'games-won', label: 'Games won', aggregation: 'sum' },
  ],
});

const heat = fixtureDescriptor({
  descriptorId: '01890000-0000-7000-8000-0000000000h1',
  version: '1.0.0',
  name: 'Lane Heat',
  statistics: [{ code: 'placement-points', label: 'Placement points', aggregation: 'sum' }],
});

describe('recorded outcome validation', () => {
  it('accepts a duel carrying only declared statistics', () => {
    const result = validateRecordedOutcome(tennis, {
      matchId: 'm-1',
      winnerEntrantId: 'alfa',
      sides: [
        { entrantId: 'alfa', statistics: { 'matches-won': 1, 'sets-won': 2, 'games-won': 18 } },
        { entrantId: 'bravo', statistics: { 'matches-won': 0, 'sets-won': 1, 'games-won': 14 } },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it('rejects a statistic code the bound discipline does not declare', () => {
    const result = validateRecordedOutcome(tennis, {
      matchId: 'm-1',
      sides: [
        { entrantId: 'alfa', statistics: { 'matches-won': 1, 'goals-for': 3 } },
        { entrantId: 'bravo', statistics: { 'matches-won': 0 } },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('OUTCOME_VALIDATION_FAILED');
    expect(result.error.message).toContain('goals-for');
    expect(result.error.details?.entrantId).toBe('alfa');
  });

  it('accepts more than two sides', () => {
    const result = validateRecordedOutcome(
      heat,
      {
        matchId: 'heat-1',
        sides: Array.from({ length: 8 }, (_unused, index) => ({
          entrantId: `lane-${index + 1}`,
          statistics: { 'placement-points': 8 - index },
          placement: index + 1,
        })),
      },
      { shape: 'placement' },
    );

    expect(result.ok).toBe(true);
  });

  it('rejects a placement outcome leaving a side unplaced', () => {
    const result = validateRecordedOutcome(
      heat,
      {
        matchId: 'heat-1',
        sides: [
          { entrantId: 'lane-1', statistics: { 'placement-points': 8 }, placement: 1 },
          { entrantId: 'lane-2', statistics: { 'placement-points': 7 } },
        ],
      },
      { shape: 'placement' },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details?.entrantId).toBe('lane-2');
  });

  it('rejects a winner that is not one of the sides', () => {
    const result = validateRecordedOutcome(tennis, {
      matchId: 'm-1',
      winnerEntrantId: 'charlie',
      sides: [
        { entrantId: 'alfa', statistics: {} },
        { entrantId: 'bravo', statistics: {} },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('charlie');
  });

  it('rejects the same entrant on two sides', () => {
    const result = validateRecordedOutcome(tennis, {
      matchId: 'm-1',
      sides: [
        { entrantId: 'alfa', statistics: {} },
        { entrantId: 'alfa', statistics: {} },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details?.entrantId).toBe('alfa');
  });

  it.each([
    ['no sides', { matchId: 'm-1', sides: [] }],
    [
      'a non-numeric statistic value',
      { matchId: 'm-1', sides: [{ entrantId: 'a', statistics: { 'sets-won': '2' } }] },
    ],
    [
      'a zero placement',
      { matchId: 'm-1', sides: [{ entrantId: 'a', statistics: {}, placement: 0 }] },
    ],
    ['an undeclared member', { matchId: 'm-1', sides: [], forfeited: true }],
  ])('rejects an outcome with %s', (_case, document) => {
    expect(validateRecordedOutcome(tennis, document).ok).toBe(false);
  });

  it('round-trips a duel result with one side’s reason set and the other omitted', () => {
    const result = validateRecordedOutcome(tennis, {
      matchId: 'm-1',
      winnerEntrantId: 'alfa',
      sides: [
        { entrantId: 'alfa', statistics: {} },
        { entrantId: 'bravo', statistics: {}, resultReason: 'administrative-loss' },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sides[1]?.resultReason).toBe('administrative-loss');
    expect(result.value.sides[0]?.resultReason).toBeUndefined();
  });

  it('round-trips a free-for-all result with one competitor disqualified, per-entrant not per-match', () => {
    const result = validateRecordedOutcome(
      heat,
      {
        matchId: 'heat-1',
        sides: [
          { entrantId: 'lane-1', statistics: { 'placement-points': 8 }, placement: 1 },
          {
            entrantId: 'lane-2',
            statistics: { 'placement-points': 0 },
            placement: 2,
            resultReason: 'disqualified',
          },
          { entrantId: 'lane-3', statistics: { 'placement-points': 6 }, placement: 3 },
        ],
      },
      { shape: 'placement' },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sides.map((side) => side.resultReason)).toEqual([
      undefined,
      'disqualified',
      undefined,
    ]);
  });

  it('compiles one validator per descriptor version', () => {
    const v2 = fixtureDescriptor({
      descriptorId: tennis.descriptorId,
      version: '2.0.0',
      statistics: [{ code: 'tiebreaks-won', label: 'Tiebreaks won', aggregation: 'sum' }],
    });

    const outcome = {
      matchId: 'm-1',
      sides: [{ entrantId: 'alfa', statistics: { 'sets-won': 2 } }],
    };
    expect(validateRecordedOutcome(tennis, outcome).ok).toBe(true);
    expect(validateRecordedOutcome(v2, outcome).ok).toBe(false);
  });
});
