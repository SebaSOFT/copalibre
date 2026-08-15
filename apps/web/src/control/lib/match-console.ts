/**
 * Pure derivation logic for the live match console, extracted from
 * `MatchConsoleRoute.tsx` so it is unit-testable in isolation rather
 * than only reachable through a full component render.
 */

import { v7 as uuidv7 } from 'uuid';
import type { ConsoleEventDefinition, MatchConsoleResponse } from './api-client.js';

export function newIdempotencyKey(): string {
  return uuidv7();
}

export function currentEpochMilliseconds(): number {
  return Date.now();
}

export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

export function descriptionFor(
  definition: ConsoleEventDefinition,
  description: string,
): string | undefined {
  if (description.trim() === '') return undefined;
  const properties = definition.payloadSchema.properties;
  if (typeof properties !== 'object' || properties === null || !('description' in properties)) {
    return undefined;
  }
  return description.trim();
}

/**
 * `unknownSegmentLabel` is caller-supplied (rather than a fixed fallback
 * string here) so this stays a plain, `intl`-free function testable without
 * a React context — the caller resolves the translated fallback via
 * `useIntl().formatMessage()`.
 */
export function segmentLabel(
  projection: MatchConsoleResponse,
  segmentId: string,
  unknownSegmentLabel: string,
): string {
  const segment = projection.segments.find((candidate) => candidate.segmentId === segmentId);
  return segment ? `${segment.type} ${segment.number}` : unknownSegmentLabel;
}

/**
 * Whether an event definition belongs in the recording palette right now:
 * gated by the active segment's type and, per actor requirement, by whether
 * an eligible actor to attribute it to actually exists.
 */
export function isEventPermitted(
  definition: ConsoleEventDefinition,
  projection: Pick<MatchConsoleResponse, 'entrantIds' | 'eligiblePersonIds' | 'eligibleStaffIds'>,
  activeSegment: MatchConsoleResponse['segments'][number] | undefined,
): boolean {
  if (!activeSegment || !definition.permittedSegmentTypes.includes(activeSegment.type)) {
    return false;
  }
  if (definition.actorRequirement === 'side') return projection.entrantIds.length > 0;
  if (definition.actorRequirement === 'person') {
    return projection.entrantIds.length > 0 && projection.eligiblePersonIds.length > 0;
  }
  if (definition.actorRequirement === 'person-or-staff') {
    return (
      projection.entrantIds.length > 0 &&
      (projection.eligiblePersonIds.length > 0 || projection.eligibleStaffIds.length > 0)
    );
  }
  return true;
}
