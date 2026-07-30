import type { FieldPolicy, MergeStrategyName } from '../descriptors/override-policy.js';
import { fixtureDescriptor } from '../test-support/fixture-descriptor.js';
import { compileEffectiveRuleset } from './compiler.js';
import type { StageConfiguration, TournamentRuleset } from './tournament-ruleset.js';

function ruleset(overrides: Record<string, unknown>): TournamentRuleset {
  return {
    rulesetId: 'rs-1',
    tournamentId: 't-1',
    version: 7,
    descriptorRef: { descriptorId: 'd-1', version: '3.0.0' },
    overrides,
  };
}

function stage(overrides: Record<string, unknown>): StageConfiguration {
  return {
    stageConfigurationId: 'sc-1',
    stageId: 's-1',
    version: 2,
    rulesetId: 'rs-1',
    overrides,
  };
}

describe('compileEffectiveRuleset', () => {
  it('compiles descriptor defaults untouched when no overrides exist', () => {
    const result = compileEffectiveRuleset(fixtureDescriptor());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.config).toEqual(fixtureDescriptor().defaults);
      expect(result.value.compiledFrom.descriptorVersion).toBe('3.0.0');
      expect(result.value.compiledFrom.rulesetId).toBeUndefined();
    }
  });

  it('applies a replaced override wholesale', () => {
    const result = compileEffectiveRuleset(
      fixtureDescriptor(),
      ruleset({ 'scoring.pointsPerWin': 2 }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.value.config.scoring as Record<string, unknown>).pointsPerWin).toBe(2);
      // Sibling untouched.
      expect((result.value.config.scoring as Record<string, unknown>).pointsPerDraw).toBe(1);
    }
  });

  it('merges union-list without duplicating existing entries', () => {
    const result = compileEffectiveRuleset(
      fixtureDescriptor(),
      ruleset({ tiebreakers: ['score-difference', 'head-to-head'] }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.config.tiebreakers).toEqual([
        'points',
        'score-difference',
        'head-to-head',
      ]);
    }
  });

  it('merges append-list preserving duplicates and order', () => {
    const descriptor = fixtureDescriptor({
      defaults: { ...fixtureDescriptor().defaults, noteTemplates: ['warmup'] },
    });
    const result = compileEffectiveRuleset(
      descriptor,
      ruleset({ noteTemplates: ['warmup', 'cooldown'] }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.config.noteTemplates).toEqual(['warmup', 'warmup', 'cooldown']);
    }
  });

  it('merges shallow-object one level deep', () => {
    const result = compileEffectiveRuleset(
      fixtureDescriptor(),
      ruleset({ segments: { overtimeEnabled: true } }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.config.segments).toEqual({
        regulationCount: 2,
        overtimeEnabled: true,
      });
    }
  });

  it('rejects an override of a forbidden field, naming it', () => {
    const result = compileEffectiveRuleset(
      fixtureDescriptor(),
      ruleset({ 'identityRules.federationCode': 'HACK-9' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.violations).toEqual([
        expect.objectContaining({
          field: 'identityRules.federationCode',
          reason: 'forbidden-override',
        }),
      ]);
    }
  });

  it('rejects an override of an inherited field', () => {
    const result = compileEffectiveRuleset(
      fixtureDescriptor(),
      ruleset({ 'venuePolicy.neutralGround': true }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.violations[0]?.reason).toBe('inherited-field');
    }
  });

  it('rejects an override with no declared policy instead of deep-merging', () => {
    const result = compileEffectiveRuleset(fixtureDescriptor(), ruleset({ scoring: {} }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.violations[0]).toMatchObject({
        field: 'scoring',
        reason: 'unknown-field',
      });
    }
  });

  it('rejects a policy whose merge strategy is not a defined strategy', () => {
    const base = fixtureDescriptor();
    const bogus: FieldPolicy = {
      permission: { kind: 'merged', strategy: 'recursive-magic' as MergeStrategyName },
      mutationClass: 'safe',
    };
    const descriptor = fixtureDescriptor({
      fieldPolicies: { ...base.fieldPolicies, tiebreakers: bogus },
    });
    const result = compileEffectiveRuleset(descriptor, ruleset({ tiebreakers: ['h2h'] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.violations[0]?.reason).toBe('unknown-merge-strategy');
    }
  });

  it('rejects a merge whose value shapes do not fit the strategy', () => {
    const result = compileEffectiveRuleset(
      fixtureDescriptor(),
      ruleset({ tiebreakers: 'not-a-list' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.violations[0]?.reason).toBe('missing-merge-strategy');
    }
  });

  it('collects every violation across both layers in one error', () => {
    const result = compileEffectiveRuleset(
      fixtureDescriptor(),
      ruleset({ 'identityRules.federationCode': 'X' }),
      stage({ 'venuePolicy.neutralGround': true, unknownField: 1 }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.violations.map((v) => v.reason).sort()).toEqual([
        'forbidden-override',
        'inherited-field',
        'unknown-field',
      ]);
    }
  });

  it('applies stage overrides after tournament overrides', () => {
    const result = compileEffectiveRuleset(
      fixtureDescriptor(),
      ruleset({ 'scoring.pointsPerWin': 2 }),
      stage({ 'scoring.pointsPerWin': 5 }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.value.config.scoring as Record<string, unknown>).pointsPerWin).toBe(5);
    }
  });

  it('records full provenance versions on the compiled snapshot', () => {
    const result = compileEffectiveRuleset(
      fixtureDescriptor(),
      ruleset({ 'scoring.pointsPerWin': 2 }),
      stage({ segments: { overtimeEnabled: true } }),
      () => '2026-07-29T12:00:00.000Z',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.compiledFrom).toEqual({
        descriptorId: '01890000-0000-7000-8000-000000000001',
        descriptorVersion: '3.0.0',
        rulesetId: 'rs-1',
        rulesetVersion: 7,
        stageConfigurationId: 'sc-1',
        stageConfigurationVersion: 2,
      });
      expect(result.value.compiledAt).toBe('2026-07-29T12:00:00.000Z');
    }
  });

  it('returns a deeply immutable snapshot', () => {
    const result = compileEffectiveRuleset(fixtureDescriptor());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value.config)).toBe(true);
      expect(Object.isFrozen(result.value.config.scoring)).toBe(true);
      expect(() => {
        (result.value.config as Record<string, unknown>).scoring = {};
      }).toThrow();
    }
  });

  it('never mutates the descriptor defaults it compiled from', () => {
    const descriptor = fixtureDescriptor();
    const before = structuredClone(descriptor.defaults);
    compileEffectiveRuleset(descriptor, ruleset({ segments: { overtimeEnabled: true } }));
    expect(descriptor.defaults).toEqual(before);
  });
});
