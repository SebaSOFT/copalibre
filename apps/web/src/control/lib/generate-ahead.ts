import type { SeedingQualifierZoneResponse, SeedingZoneResponse } from './api-client.js';
import type { CanvasMatch } from './bracket-canvas.js';
import { generatePreviewMatches } from './wizard-preview.js';

const PLACEHOLDER = 'qualifier-';

/**
 * The bracket a zone would be generated ahead into, drawn before anything is written: the
 * engine builds it over placeholder seeds, then each seed's slot names its qualifier position.
 * Seed `k` is the zone's `k`-th qualifier, exactly as the API generates it.
 */
export function aheadPreviewMatches(zone: SeedingQualifierZoneResponse): readonly CanvasMatch[] {
  const matches = generatePreviewMatches(
    zone.format,
    zone.seeds.map((_, index) => ({ entrantId: `${PLACEHOLDER}${index + 1}`, seed: index + 1 })),
  );
  return matches.map((match) => ({
    ...match,
    slots: match.slots.map((slot) => {
      const seed = slot.entrantId?.startsWith(PLACEHOLDER)
        ? zone.seeds[Number(slot.entrantId.slice(PLACEHOLDER.length)) - 1]
        : undefined;
      if (seed === undefined) return slot;
      return {
        kind: 'qualifier' as const,
        source: {
          kind: 'qualifier' as const,
          position: seed.position,
          qualifierLabel: seed.qualifierLabel,
        },
      };
    }),
  }));
}

/** Whether the stage's current bracket was generated ahead: some side names a qualifier. */
export function isGeneratedAhead(zones: readonly SeedingZoneResponse[]): boolean {
  return zones.some((zone) =>
    zone.matches.some((match) => match.slots.some((slot) => slot.source?.kind === 'qualifier')),
  );
}
