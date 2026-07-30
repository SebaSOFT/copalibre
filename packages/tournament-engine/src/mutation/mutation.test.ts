import { generateFixtures } from '../fixtures/index.js';
import { classifyEngineMutation, type EngineMutation } from './index.js';

const g = (() => {
  const result = generateFixtures({
    format: 'single-elimination',
    entrants: [1, 2, 3, 4].map((seed) => ({ entrantId: `e${seed}`, seed })),
  });
  if (!result.ok) throw result.error;
  return result.value;
})();

const fresh = { hasRecordedResults: false, hasGeneratedFixtures: false };
const generated = { hasRecordedResults: false, hasGeneratedFixtures: true };
const played = { hasRecordedResults: true, hasGeneratedFixtures: true };

describe('classifyEngineMutation', () => {
  it.each([['format'], ['seeding'], ['structure']] as const)(
    'blocks a %s change once a result exists',
    (kind) => {
      const decision = classifyEngineMutation({ kind } as EngineMutation, played, g);
      expect(decision.mutationClass).toBe('blocked_after_results');
      expect(decision.invalidates).toEqual([]);
    },
  );

  it('directs a blocked format change to the correction workflow', () => {
    expect(classifyEngineMutation({ kind: 'format' }, played, g).reason).toContain(
      'correction workflow',
    );
  });

  it.each([['format'], ['seeding'], ['structure']] as const)(
    'treats a %s change before generation as safe',
    (kind) => {
      expect(classifyEngineMutation({ kind } as EngineMutation, fresh).mutationClass).toBe('safe');
    },
  );

  it.each([['format'], ['seeding'], ['structure']] as const)(
    'requires a rebuild for a %s change after generation but before results',
    (kind) => {
      const decision = classifyEngineMutation({ kind } as EngineMutation, generated, g);
      expect(decision.mutationClass).toBe('requires_rebuild');
      expect(decision.invalidates).toEqual(g.matches.map((match) => match.id));
    },
  );

  it('reports exactly which fixtures a rebuild invalidates', () => {
    const decision = classifyEngineMutation({ kind: 'seeding' }, generated, g);
    expect(decision.invalidates).toHaveLength(3);
    expect(decision.invalidates).toContain('SE-R2-M1');
  });

  it('keeps scoring configuration safe even mid-tournament', () => {
    const decision = classifyEngineMutation({ kind: 'scoring' }, played, g);
    expect(decision.mutationClass).toBe('safe');
    expect(decision.reason).toContain('without touching fixtures or results');
  });

  it('invalidates nothing when no graph is supplied', () => {
    expect(classifyEngineMutation({ kind: 'seeding' }, generated).invalidates).toEqual([]);
  });
});
