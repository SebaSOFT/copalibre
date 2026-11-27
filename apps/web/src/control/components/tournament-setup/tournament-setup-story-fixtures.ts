import type { DisciplineOption } from '../../lib/wizard.js';
import { discipline } from '../screen-story-fixtures.js';

export const disciplineWithDoubleElimination: DisciplineOption = {
  ...discipline,
  supportedFormats: ['single-elimination', 'double-elimination', 'round-robin'],
};

export const disciplineWithRulesetFields: DisciplineOption = {
  ...discipline,
  defaults: { scoring: { pointsPerWin: 3 }, tiebreakers: ['points', 'goals-for'] },
  fieldPolicies: {
    format: { permission: { kind: 'replaced' }, mutationClass: 'blocked_after_results' },
    'registration.capacity': {
      permission: { kind: 'replaced' },
      mutationClass: 'requires_rebuild',
    },
    'scoring.pointsPerWin': {
      permission: { kind: 'replaced' },
      mutationClass: 'blocked_after_results',
    },
    tiebreakers: {
      permission: { kind: 'merged', strategy: 'union-list' },
      mutationClass: 'requires_rebuild',
    },
  },
};
