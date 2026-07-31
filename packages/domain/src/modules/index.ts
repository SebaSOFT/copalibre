import type { DisciplineDescriptor } from '../descriptors/discipline-descriptor.js';
import { battleRoyaleDescriptor } from './battle-royale-descriptor.js';
import { footballDescriptor } from './football-descriptor.js';
import { swimmingDescriptor } from './swimming-descriptor.js';
import { tennisDescriptor } from './tennis-descriptor.js';

/**
 * The seeded discipline modules an installation starts with.
 *
 * They are ordinary modules with no privileges: they declare their statistics
 * and their win condition exactly as a community-authored module must, and are
 * validated by the same descriptor schema. Football is the duel/aggregate
 * reference, tennis the nested-scoring one, battle royale the placement-scoring
 * one, and swimming the time-based heats one — between them they exercise every
 * shape the engine claims to support.
 */
export { footballDescriptor } from './football-descriptor.js';
export { tennisDescriptor, bestOfFiveWinCondition } from './tennis-descriptor.js';
export { battleRoyaleDescriptor } from './battle-royale-descriptor.js';
export { swimmingDescriptor } from './swimming-descriptor.js';
export {
  winConditionScript,
  type SegmentRuleSpec,
  type MatchRuleSpec,
} from './win-condition-scripts.js';

export function seededDescriptors(): readonly DisciplineDescriptor[] {
  return [footballDescriptor(), tennisDescriptor(), battleRoyaleDescriptor(), swimmingDescriptor()];
}
