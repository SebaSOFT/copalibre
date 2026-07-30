import type { MutationClass } from '@copalibre/domain';
import type { FixtureGraph } from '../types.js';

/**
 * Mutation classification for engine-owned configuration, per the
 * tournament-engine decision record's `safe` / `requires_rebuild` /
 * `blocked_after_results` contract. This is a product contract, not UI guidance,
 * so the classification lives next to the engine that would have to honour it.
 */

export interface EngineMutationContext {
  /** True once any match in the tournament has a recorded result. */
  readonly hasRecordedResults: boolean;
  /** True once fixtures have been generated and persisted. */
  readonly hasGeneratedFixtures: boolean;
}

export type EngineMutation =
  | { readonly kind: 'format' }
  | { readonly kind: 'seeding' }
  /** Entrant added/removed, stage structure altered — anything reshaping the graph. */
  | { readonly kind: 'structure' }
  /** Points/tiebreak configuration: changes standings, never the fixture graph. */
  | { readonly kind: 'scoring' };

export interface ClassifiedMutation {
  readonly mutationClass: MutationClass;
  readonly reason: string;
  /** Fixture ids invalidated if this is applied. Only for `requires_rebuild`. */
  readonly invalidates: readonly string[];
}

export function classifyEngineMutation(
  mutation: EngineMutation,
  context: EngineMutationContext,
  graph?: FixtureGraph,
): ClassifiedMutation {
  const allFixtureIds = graph?.matches.map((match) => match.id) ?? [];

  switch (mutation.kind) {
    case 'format':
      // Changing format invalidates every generated fixture and every result
      // recorded against them, so it is unavailable once a result exists.
      return context.hasRecordedResults
        ? {
            mutationClass: 'blocked_after_results',
            reason:
              'Format cannot change once a result exists; use the audited correction workflow',
            invalidates: [],
          }
        : {
            mutationClass: context.hasGeneratedFixtures ? 'requires_rebuild' : 'safe',
            reason: context.hasGeneratedFixtures
              ? 'Format change regenerates every fixture'
              : 'No fixtures generated yet',
            invalidates: context.hasGeneratedFixtures ? allFixtureIds : [],
          };

    case 'seeding':
      if (context.hasRecordedResults) {
        return {
          mutationClass: 'blocked_after_results',
          reason: 'Seeding cannot change once a result exists',
          invalidates: [],
        };
      }
      return context.hasGeneratedFixtures
        ? {
            mutationClass: 'requires_rebuild',
            reason: 'Reseeding regenerates the fixture graph',
            invalidates: allFixtureIds,
          }
        : {
            mutationClass: 'safe',
            reason: 'Seeding before fixture generation has no downstream effect',
            invalidates: [],
          };

    case 'structure':
      if (context.hasRecordedResults) {
        return {
          mutationClass: 'blocked_after_results',
          reason: 'Structural change cannot be applied once a result exists',
          invalidates: [],
        };
      }
      return context.hasGeneratedFixtures
        ? {
            mutationClass: 'requires_rebuild',
            reason: 'Structural change regenerates affected fixtures',
            invalidates: allFixtureIds,
          }
        : { mutationClass: 'safe', reason: 'No fixtures to invalidate', invalidates: [] };

    case 'scoring':
      // Scoring/tiebreak configuration only re-derives standings; fixtures and
      // recorded facts are untouched, so this stays safe even mid-tournament.
      return {
        mutationClass: 'safe',
        reason: 'Scoring configuration re-derives standings without touching fixtures or results',
        invalidates: [],
      };
  }
}
