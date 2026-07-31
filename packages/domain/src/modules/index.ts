import type { DisciplineDescriptor } from '../descriptors/discipline-descriptor.js';
import { footballDescriptor } from './football-descriptor.js';
import { tennisDescriptor } from './tennis-descriptor.js';

/**
 * The seeded discipline modules an installation starts with.
 *
 * They are ordinary modules with no privileges: they declare their statistics
 * and their win condition exactly as a community-authored module must, and are
 * validated by the same descriptor schema. Football is the duel/aggregate
 * reference, tennis the nested-scoring one.
 */
export { footballDescriptor } from './football-descriptor.js';
export { tennisDescriptor, bestOfFiveWinCondition } from './tennis-descriptor.js';
export {
  winConditionScript,
  type SegmentRuleSpec,
  type MatchRuleSpec,
} from './win-condition-scripts.js';

export function seededDescriptors(): readonly DisciplineDescriptor[] {
  return [footballDescriptor(), tennisDescriptor()];
}
