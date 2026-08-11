import type { StageAllocation } from '@copalibre/domain';
import type { TiebreakPipeline } from '@copalibre/rules';
import { AllocationError } from '../errors.js';
import type { EntrantAccounting } from '../standings/index.js';
import { previewStageTransition, type StageTransitionInput } from './index.js';

const table = (rows: readonly { id: string; points: number }[]): readonly EntrantAccounting[] =>
  rows.map((row) => ({ entrantId: row.id, statistics: { points: row.points, played: 3 } }));

const byPoints: TiebreakPipeline = {
  id: 'group-table',
  version: 1,
  parameters: [
    {
      id: 'points',
      label: 'Points',
      valueType: 'number',
      direction: 'higher_wins',
      missingValue: 'treat-as-zero',
      source: 'calculated',
    },
  ],
};

const groupTable = table([
  { id: 'alfa', points: 9 },
  { id: 'bravo', points: 6 },
  { id: 'charlie', points: 3 },
  { id: 'delta', points: 1 },
]);

const automatic: StageAllocation = { mode: 'automatic' };

function input(overrides: Partial<StageTransitionInput> = {}): StageTransitionInput {
  return {
    accounting: groupTable,
    pipeline: byPoints,
    advance: 2,
    allocation: automatic,
    nextFormat: 'single-elimination',
    preconditions: { priorStageStatus: 'complete' },
    ...overrides,
  };
}

describe('previewing a stage transition', () => {
  it('runs standings → cut → seeds → fixtures in one pass', () => {
    const preview = previewStageTransition(input());

    expect(preview.ready).toBe(true);
    expect(preview.blockers).toEqual([]);
    expect(preview.qualified).toEqual(['alfa', 'bravo']);
    expect(preview.eliminated).toEqual(['charlie', 'delta']);
    expect(preview.seeds).toEqual([
      { entrantId: 'alfa', seed: 1 },
      { entrantId: 'bravo', seed: 2 },
    ]);
    expect(preview.fixtures?.matches).toHaveLength(1);
  });

  it('carries the cut and allocation traces so the preview explains itself', () => {
    const { trace } = previewStageTransition(input());

    expect(trace.some((node) => node.id === 'qualification-cut')).toBe(true);
    expect(trace.some((node) => node.id === 'allocation:automatic')).toBe(true);
  });

  it('shows the bracket a weighted allocation would produce instead', () => {
    const preview = previewStageTransition(
      input({
        advance: 4,
        allocation: { mode: 'weighted', attributeKey: 'ranking', direction: 'lower-first' },
        attributes: new Map([
          ['alfa', [{ key: 'ranking', value: 4, kind: 'numeric' as const }]],
          ['bravo', [{ key: 'ranking', value: 3, kind: 'numeric' as const }]],
          ['charlie', [{ key: 'ranking', value: 1, kind: 'numeric' as const }]],
          ['delta', [{ key: 'ranking', value: 2, kind: 'numeric' as const }]],
        ]),
      }),
    );

    // Group order says alfa first; the ranking says charlie. The preview is
    // where an operator sees that difference before committing to it.
    expect(preview.seeds[0]?.entrantId).toBe('charlie');
    expect(preview.qualified[0]).toBe('alfa');
  });

  it('is read-only: running it twice changes nothing and yields the same answer', () => {
    const request = input();
    expect(previewStageTransition(request)).toEqual(previewStageTransition(request));
    // The inputs are untouched — there is nothing to commit and nothing mutated.
    expect(request.accounting).toEqual(groupTable);
  });
});

describe('a blocked transition', () => {
  it('reports an open prior stage rather than throwing', () => {
    const preview = previewStageTransition(
      input({ preconditions: { priorStageStatus: 'running' } }),
    );

    expect(preview.ready).toBe(false);
    expect(preview.blockers).toEqual(['the prior stage is running, not complete']);
    // Still computed: the operator sees what closing the stage would produce.
    expect(preview.fixtures?.matches).toHaveLength(1);
    expect(preview.qualified).toEqual(['alfa', 'bravo']);
  });

  it('produces no seeds or fixtures while the cut is contested', () => {
    const tied = table([
      { id: 'alfa', points: 9 },
      { id: 'bravo', points: 6 },
      { id: 'charlie', points: 6 },
      { id: 'delta', points: 1 },
    ]);

    const preview = previewStageTransition(input({ accounting: tied }));

    expect(preview.ready).toBe(false);
    expect(preview.blockers).toContain('the qualification cut is unresolved');
    expect(preview.seeds).toEqual([]);
    expect(preview.fixtures).toBeUndefined();
    expect(preview.trace.at(-1)).toMatchObject({ outcome: 'unresolved-tie' });
  });

  it('reports fixtures that already exist as a rebuild', () => {
    const preview = previewStageTransition(
      input({ preconditions: { priorStageStatus: 'complete', nextStageFixturesGenerated: true } }),
    );

    expect(preview.ready).toBe(false);
    expect(preview.blockers[0]).toContain('rebuild');
  });

  it('still throws on a configuration defect, which is not a state to preview', () => {
    expect(() =>
      previewStageTransition(
        input({
          allocation: { mode: 'weighted', attributeKey: 'ranking', direction: 'lower-first' },
        }),
      ),
    ).toThrow(AllocationError);
  });
});
