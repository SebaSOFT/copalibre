import {
  validateNextStage,
  type NextStagePreconditions,
  type StageAllocation,
  type TournamentFormat,
} from '@copalibre/domain';
import type { TraceNode } from '@copalibre/rules';
import { allocateSeeds, type AllocationEntrant } from '../allocation/index.js';
import { generateFixtures } from '../fixtures/index.js';
import { evaluateQualification, type QualificationInput } from '../qualification/index.js';
import type { EntrantAccounting } from '../standings/index.js';
import type { FixtureGraph, SeededEntrant } from '../types.js';

/**
 * One stage feeding the next: standings → cut → seeds → fixtures.
 *
 * The whole transition is computed as one pure function so it can be shown to
 * an operator before anything is written. That is what "preview" means here —
 * not a second, simplified code path that might disagree with the real one, but
 * *the* code path, run without a caller to persist its result. A preview that
 * can diverge from the commit is worse than no preview.
 */

export interface StageTransitionInput {
  /** The completed stage's aggregated standings. */
  readonly accounting: readonly EntrantAccounting[];
  readonly pipeline: QualificationInput['pipeline'];
  readonly advance: number;
  readonly allocation: StageAllocation;
  readonly nextFormat: TournamentFormat;
  /** Attributes the next stage's allocation may read (weighted seeding). */
  readonly attributes?: ReadonlyMap<string, AllocationEntrant['attributes']>;
  /** Operator placements, for manual allocation. */
  readonly placements?: readonly { readonly entrantId: string; readonly seed: number }[];
  readonly preconditions: Omit<NextStagePreconditions, 'cutResolved'>;
}

export interface StageTransitionPreview {
  /** True when the transition may be committed as it stands. */
  readonly ready: boolean;
  /** Why it may not be, when it may not. Empty when ready. */
  readonly blockers: readonly string[];
  readonly qualified: readonly string[];
  readonly eliminated: readonly string[];
  readonly seeds: readonly SeededEntrant[];
  /** Absent while the transition is blocked — there is nothing to generate. */
  readonly fixtures?: FixtureGraph;
  readonly trace: readonly TraceNode[];
}

/**
 * Computes the whole transition and reports whether it may be committed.
 *
 * Never throws for an ordinary blocked state — an unresolved cut or an open
 * prior stage is a thing an operator needs to *see*, not an exception. Genuine
 * configuration defects (an impossible allocation, an unsupported format) still
 * throw, because there is nothing to preview.
 */
export function previewStageTransition(input: StageTransitionInput): StageTransitionPreview {
  const cut = evaluateQualification({
    accounting: input.accounting,
    pipeline: input.pipeline,
    advance: input.advance,
  });

  const gate = validateNextStage({ ...input.preconditions, cutResolved: cut.resolved });
  const blockers = gate.ok ? [] : [...gate.error.failures];

  if (!cut.resolved) {
    return {
      ready: false,
      blockers,
      qualified: [],
      eliminated: [],
      seeds: [],
      trace: cut.trace,
    };
  }

  const entrants: readonly AllocationEntrant[] = cut.qualified.map((entrantId) => ({
    entrantId,
    attributes: input.attributes?.get(entrantId),
  }));

  const allocation = allocateSeeds({
    allocation: input.allocation,
    entrants,
    qualified: cut.qualified,
    placements: input.placements,
  });

  const generated = generateFixtures({ format: input.nextFormat, entrants: allocation.seeds });
  if (!generated.ok) throw generated.error;

  return {
    ready: blockers.length === 0,
    blockers,
    qualified: cut.qualified,
    eliminated: cut.eliminated,
    seeds: allocation.seeds,
    // The fixtures are computed either way: an operator deciding whether to
    // close a stage wants to see the bracket it would produce.
    fixtures: generated.value,
    trace: [...cut.trace, ...allocation.trace],
  };
}
