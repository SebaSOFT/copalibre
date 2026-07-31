import { validateNextStage, validateStageCompletion } from './stage-completion.js';

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
