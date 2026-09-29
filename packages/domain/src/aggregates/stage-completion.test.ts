import {
  foldTournamentCompletion,
  validateNextStage,
  validateStageCompletion,
} from './stage-completion.js';

const running = { status: 'running' as const, totalMatches: 6, resolvedMatches: 6 };

describe('validateStageCompletion', () => {
  it('completes a running stage whose matches are all resolved', () => {
    expect(validateStageCompletion(running).ok).toBe(true);
  });

  it('refuses a stage with matches still unresolved, counting them', () => {
    const result = validateStageCompletion({ ...running, resolvedMatches: 4 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.failures).toEqual(['2 of 6 matches are unresolved']);
  });

  it('refuses a stage whose results are all in but whose corrections are open', () => {
    // The distinction the whole state exists for: every result recorded is not
    // the same as the table being safe to draw the next stage from.
    const result = validateStageCompletion({ ...running, openCorrections: 1 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.failures).toEqual(['1 correction(s) are still open']);
  });

  it('refuses a stage that never started', () => {
    const result = validateStageCompletion({ ...running, status: 'pending' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.failures).toContain('stage has not started');
  });

  it('refuses to complete a stage twice', () => {
    const result = validateStageCompletion({ ...running, status: 'complete' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.failures).toContain('stage is already complete');
  });

  it('refuses a stage holding no matches at all', () => {
    const result = validateStageCompletion({ ...running, totalMatches: 0, resolvedMatches: 0 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.failures).toContain('stage has no matches');
  });

  it('reports every failure at once rather than the first', () => {
    const result = validateStageCompletion({
      status: 'pending',
      totalMatches: 4,
      resolvedMatches: 1,
      openCorrections: 2,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.failures).toHaveLength(3);
    expect(result.error.code).toBe('STAGE_COMPLETION_REFUSED');
  });
});

describe('validateNextStage', () => {
  it('opens the gate on a complete stage with a resolved cut', () => {
    expect(validateNextStage({ priorStageStatus: 'complete', cutResolved: true }).ok).toBe(true);
  });

  it('refuses while the prior stage is still running', () => {
    const result = validateNextStage({ priorStageStatus: 'running', cutResolved: true });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.failures).toContain('the prior stage is running, not complete');
  });

  it('refuses a complete stage whose cut is still contested', () => {
    // Neither condition implies the other: completion says the results are
    // final, the cut says who they send through.
    const result = validateNextStage({ priorStageStatus: 'complete', cutResolved: false });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.failures).toEqual(['the qualification cut is unresolved']);
  });

  it('refuses to generate over fixtures that already exist', () => {
    const result = validateNextStage({
      priorStageStatus: 'complete',
      cutResolved: true,
      nextStageFixturesGenerated: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NEXT_STAGE_NOT_READY');
    expect(result.error.failures[0]).toContain('rebuild');
  });
});

describe('foldTournamentCompletion', () => {
  it('handles an empty input with all zero totals and no stages', () => {
    const summary = foldTournamentCompletion([]);
    expect(summary).toEqual({
      totalMatches: 0,
      resolvedMatches: 0,
      liveMatches: 0,
      scheduledMatches: 0,
      finalizedMatches: 0,
      forfeitedMatches: 0,
      stages: [],
    });
  });

  it('reports zero for a stage with no generated fixtures (status null, count 0)', () => {
    const summary = foldTournamentCompletion([
      {
        stageId: 'stage-1',
        stageNumber: 1,
        stageName: 'Group Stage',
        status: null,
        count: 0,
      },
    ]);

    expect(summary.totalMatches).toBe(0);
    expect(summary.resolvedMatches).toBe(0);
    expect(summary.liveMatches).toBe(0);
    expect(summary.scheduledMatches).toBe(0);
    expect(summary.finalizedMatches).toBe(0);
    expect(summary.forfeitedMatches).toBe(0);
    expect(summary.stages).toEqual([
      {
        stageId: 'stage-1',
        stageNumber: 1,
        stageName: 'Group Stage',
        totalMatches: 0,
        resolvedMatches: 0,
        liveMatches: 0,
        scheduledMatches: 0,
        finalizedMatches: 0,
        forfeitedMatches: 0,
      },
    ]);
  });

  it('correctly folds a mix of statuses, treating finalized + forfeited as resolved and omitting not-required', () => {
    const summary = foldTournamentCompletion([
      { stageId: 'stage-1', stageNumber: 1, stageName: 'Playoffs', status: 'finalized', count: 4 },
      { stageId: 'stage-1', stageNumber: 1, stageName: 'Playoffs', status: 'forfeited', count: 1 },
      { stageId: 'stage-1', stageNumber: 1, stageName: 'Playoffs', status: 'live', count: 1 },
      {
        stageId: 'stage-1',
        stageNumber: 1,
        stageName: 'Playoffs',
        status: 'in-progress',
        count: 1,
      },
      { stageId: 'stage-1', stageNumber: 1, stageName: 'Playoffs', status: 'scheduled', count: 2 },
      {
        stageId: 'stage-1',
        stageNumber: 1,
        stageName: 'Playoffs',
        status: 'not-required',
        count: 3,
      },
    ]);

    expect(summary.totalMatches).toBe(9); // 4 + 1 + 1 + 1 + 2 = 9
    expect(summary.resolvedMatches).toBe(5); // 4 finalized + 1 forfeited
    expect(summary.finalizedMatches).toBe(4);
    expect(summary.forfeitedMatches).toBe(1);
    expect(summary.liveMatches).toBe(2); // 1 live + 1 in-progress
    expect(summary.scheduledMatches).toBe(2);
    expect(summary.stages).toHaveLength(1);
    expect(summary.stages[0]?.totalMatches).toBe(9);
    expect(summary.stages[0]?.resolvedMatches).toBe(5);
  });

  it('rolls up multiple stages and orders them by stageNumber', () => {
    const summary = foldTournamentCompletion([
      { stageId: 's-2', stageNumber: 2, stageName: 'Finals', status: 'scheduled', count: 4 },
      { stageId: 's-1', stageNumber: 1, stageName: 'Groups', status: 'finalized', count: 8 },
      { stageId: 's-1', stageNumber: 1, stageName: 'Groups', status: 'forfeited', count: 2 },
      { stageId: 's-3', stageNumber: 3, stageName: 'Placement', status: null, count: 0 },
    ]);

    expect(summary.totalMatches).toBe(14); // 8 + 2 + 4 + 0
    expect(summary.resolvedMatches).toBe(10); // 8 + 2
    expect(summary.scheduledMatches).toBe(4);
    expect(summary.stages.map((s) => s.stageNumber)).toEqual([1, 2, 3]);
    expect(summary.stages[0]?.stageName).toBe('Groups');
    expect(summary.stages[0]?.totalMatches).toBe(10);
    expect(summary.stages[0]?.resolvedMatches).toBe(10);
    expect(summary.stages[1]?.stageName).toBe('Finals');
    expect(summary.stages[1]?.totalMatches).toBe(4);
    expect(summary.stages[1]?.resolvedMatches).toBe(0);
    expect(summary.stages[2]?.stageName).toBe('Placement');
    expect(summary.stages[2]?.totalMatches).toBe(0);
    expect(summary.stages[2]?.resolvedMatches).toBe(0);
  });
});
