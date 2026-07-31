import type { MatchResult } from './competition.js';
import { planCorrection, type CorrectionRequest } from './result-correction.js';

const prior: MatchResult = {
  sides: [
    { entrantId: 'entrant-atlas', statistics: { goals: 2 } },
    { entrantId: 'entrant-boca', statistics: { goals: 1 } },
  ],
  winnerEntrantId: 'entrant-atlas',
  recordedAt: '2026-07-31T20:00:00.000Z',
};

function request(overrides: Partial<CorrectionRequest> = {}): CorrectionRequest {
  return {
    matchId: 'm-1',
    reason: 'Third goal was recorded against the wrong side',
    actor: 'user:organizer-1',
    replacement: {
      sides: [
        { entrantId: 'entrant-atlas', statistics: { goals: 2 } },
        { entrantId: 'entrant-boca', statistics: { goals: 3 } },
      ],
      winnerEntrantId: 'entrant-boca',
      recordedAt: '2026-07-31T21:00:00.000Z',
    },
    ...overrides,
  };
}

describe('planCorrection', () => {
  it('reports exactly whose numbers move', () => {
    const plan = planCorrection(request(), prior);

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.changedEntrantIds).toEqual(['entrant-boca']);
    expect(plan.value.prior).toEqual(prior);
  });

  it('keeps the prior result in the plan, because it is preserved and not replaced', () => {
    const plan = planCorrection(request(), prior);

    expect(plan.ok && plan.value.prior.winnerEntrantId).toBe('entrant-atlas');
  });

  it('refuses a correction with no reason', () => {
    const result = planCorrection(request({ reason: '   ' }), prior);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('CORRECTION_INVALID');
    expect(result.error.message).toContain('reason');
  });

  it('refuses to correct a match that has no result yet', () => {
    const result = planCorrection(request(), undefined);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('no result to correct');
  });

  it('refuses to change who played', () => {
    const result = planCorrection(
      request({
        replacement: {
          sides: [
            { entrantId: 'entrant-atlas', statistics: { goals: 2 } },
            { entrantId: 'entrant-river', statistics: { goals: 3 } },
          ],
          recordedAt: '2026-07-31T21:00:00.000Z',
        },
      }),
      prior,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('may not change who played');
  });

  it('refuses to drop or add a side', () => {
    const result = planCorrection(
      request({
        replacement: {
          sides: [{ entrantId: 'entrant-atlas', statistics: { goals: 2 } }],
          recordedAt: '2026-07-31T21:00:00.000Z',
        },
      }),
      prior,
    );

    expect(result.ok).toBe(false);
  });

  it('refuses a correction that changes nothing', () => {
    const result = planCorrection(request({ replacement: { ...prior } }), prior);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('changes nothing');
  });

  it('accepts a correction that only changes the winner', () => {
    const result = planCorrection(
      request({
        replacement: { ...prior, winnerEntrantId: 'entrant-boca' },
      }),
      prior,
    );

    expect(result.ok).toBe(true);
  });
});

describe('a started downstream stage', () => {
  const downstream = {
    stageId: 'st-2',
    started: true,
    qualifiedEntrantIds: ['entrant-atlas'],
  };

  it('blocks propagation while still recording the corrected fact', () => {
    const plan = planCorrection(request(), prior, downstream);

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    // The fact is true whatever the bracket is doing; what waits is the rebuild.
    expect(plan.value.blockedPropagation?.stageId).toBe('st-2');
    expect(plan.value.blockedPropagation?.reason).toContain('authorized resolution');
  });

  it('propagates freely when the downstream stage has not started', () => {
    const plan = planCorrection(request(), prior, { ...downstream, started: false });

    expect(plan.ok && plan.value.blockedPropagation).toBeUndefined();
  });

  it('propagates freely when there is no downstream stage at all', () => {
    const plan = planCorrection(request(), prior);

    expect(plan.ok && plan.value.blockedPropagation).toBeUndefined();
  });
});
