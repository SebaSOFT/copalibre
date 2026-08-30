import { battleRoyaleDescriptor } from '../modules/battle-royale-descriptor.js';
import { footballDescriptor } from '../modules/football-descriptor.js';
import { swimmingDescriptor } from '../modules/swimming-descriptor.js';
import { tennisDescriptor } from '../modules/tennis-descriptor.js';
import { compileEffectiveRuleset } from './compiler.js';
import { evaluateMutation } from './mutation.js';
import type { DisciplineDescriptor } from '../descriptors/discipline-descriptor.js';
import type { TournamentRuleset } from './tournament-ruleset.js';

/**
 * The built-in disciplines' `scoring.*` field policies (openspec 0169, task 1.1)
 * — every built-in descriptor's `defaults.scoring` declares `pointsPerWin`,
 * `pointsPerDraw` and `pointsPerLoss`, and each now has a matching
 * `fieldPolicies` entry so an organizer can revise any of them, not only
 * `pointsPerWin`/`pointsPerDraw`.
 */
describe('built-in disciplines declare a scoring.* field policy for every scoring default', () => {
  const descriptors: readonly [string, DisciplineDescriptor][] = [
    ['football', footballDescriptor()],
    ['swimming', swimmingDescriptor()],
    ['battle-royale', battleRoyaleDescriptor()],
    ['tennis', tennisDescriptor()],
  ];

  it.each(descriptors)(
    '%s classifies pointsPerWin/pointsPerDraw/pointsPerLoss',
    (_name, descriptor) => {
      for (const field of [
        'scoring.pointsPerWin',
        'scoring.pointsPerDraw',
        'scoring.pointsPerLoss',
      ]) {
        const result = evaluateMutation(descriptor.fieldPolicies, field, {
          hasRecordedResults: false,
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.mutationClass).toBe('blocked_after_results');
        }
      }
    },
  );

  it.each(descriptors)('%s refuses a scoring field once a result exists', (_name, descriptor) => {
    const result = evaluateMutation(descriptor.fieldPolicies, 'scoring.pointsPerLoss', {
      hasRecordedResults: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('audited correction workflow');
    }
  });

  it.each(descriptors)('%s refuses a field no policy declares', (_name, descriptor) => {
    const result = evaluateMutation(descriptor.fieldPolicies, 'scoring.unheardOf', {
      hasRecordedResults: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('No field policy declares');
    }
  });

  it.each(descriptors)(
    '%s compiles a scoring override for every scoring field',
    (_name, descriptor) => {
      const ruleset: TournamentRuleset = {
        rulesetId: 'ruleset-1',
        tournamentId: 'tournament-1',
        version: 1,
        descriptorRef: { descriptorId: descriptor.descriptorId, version: descriptor.version },
        overrides: {
          'scoring.pointsPerWin': 5,
          'scoring.pointsPerDraw': 2,
          'scoring.pointsPerLoss': -1,
        },
        customScripts: [],
      };
      const compiled = compileEffectiveRuleset(descriptor, ruleset);
      expect(compiled.ok).toBe(true);
      if (compiled.ok) {
        expect(compiled.value.config['scoring']).toEqual({
          pointsPerWin: 5,
          pointsPerDraw: 2,
          pointsPerLoss: -1,
        });
      }
    },
  );
});
