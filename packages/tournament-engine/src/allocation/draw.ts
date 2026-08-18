import type { DrawConstraint } from '@copalibre/domain';
import { runDraw, type DrawOutcome } from '../draw/index.js';
import type { ConstrainedEntrant } from '../constraints/index.js';

/** Draw the eligible stage entrants into numbered zones. */
export function drawZones(
  entrants: readonly ConstrainedEntrant[],
  constraints: readonly DrawConstraint[],
  zoneCount: number,
  seed: number,
): DrawOutcome {
  return runDraw({ entrants, constraints, shape: { kind: 'groups', count: zoneCount }, seed });
}

/** Draw one zone's entrants into its numbered groups. */
export function drawGroups(
  entrants: readonly ConstrainedEntrant[],
  constraints: readonly DrawConstraint[],
  groupCount: number,
  seed: number,
): DrawOutcome {
  return runDraw({ entrants, constraints, shape: { kind: 'groups', count: groupCount }, seed });
}
