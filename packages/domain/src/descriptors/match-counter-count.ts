import type { Segment } from '../aggregates/competition.js';
import type { RecordedEvent } from '../events/event-log.js';
import type { EffectiveMatchCounter } from './match-counter-resolution.js';

/** The part of a roster a count needs: who is named for which entrant. */
export interface CountableRoster {
  readonly entrantId: string;
  readonly members: readonly { readonly personId: string }[];
}

export interface MatchCounterValue {
  readonly entrantId: string;
  readonly value: number;
}

export interface MatchCounterTally {
  readonly code: string;
  readonly values: readonly MatchCounterValue[];
}

/**
 * Tallies each effective counter per side from a match's recorded events.
 *
 * - A `segment` counter counts only the events of the active segment, or of the last segment when
 *   none is active.
 * - An event naming a person is attributed to the side that person is rostered for. An event
 *   without one is attributed to its own side. An event whose side is neither a playing entrant
 *   nor rostered is skipped.
 * - Each matching event adds one. Nothing is clamped: a value past the allowance is reported as is.
 */
export function countMatchCounters(
  counters: readonly EffectiveMatchCounter[],
  events: readonly RecordedEvent[],
  segments: readonly Segment[],
  rosters: readonly CountableRoster[],
  entrantIds: readonly string[],
): readonly MatchCounterTally[] {
  const sideOfPerson = new Map<string, string>();
  for (const roster of rosters) {
    for (const member of roster.members) sideOfPerson.set(member.personId, roster.entrantId);
  }
  const segmentInPlay =
    segments.find((segment) => segment.state === 'active') ?? lastStartedSegment(segments);

  return counters.map((counter) => {
    const totals = new Map(entrantIds.map((entrantId) => [entrantId, 0]));
    for (const event of events) {
      if (!counter.events.includes(event.definitionCode)) continue;
      if (counter.scope === 'segment' && event.segmentId !== segmentInPlay?.segmentId) continue;
      const entrantId = entrantOf(event, sideOfPerson, entrantIds);
      if (entrantId === undefined) continue;
      totals.set(entrantId, (totals.get(entrantId) ?? 0) + 1);
    }
    return {
      code: counter.code,
      values: entrantIds.map((entrantId) => ({ entrantId, value: totals.get(entrantId) ?? 0 })),
    };
  });
}

function entrantOf(
  event: RecordedEvent,
  sideOfPerson: ReadonlyMap<string, string>,
  entrantIds: readonly string[],
): string | undefined {
  const rostered = event.personId === undefined ? undefined : sideOfPerson.get(event.personId);
  const side = rostered ?? event.side;
  return side !== undefined && entrantIds.includes(side) ? side : undefined;
}

/** The highest-numbered segment that has started (a pending segment has no events yet). */
function lastStartedSegment(segments: readonly Segment[]): Segment | undefined {
  return segments
    .filter((segment) => segment.state !== 'pending')
    .reduce<Segment | undefined>(
      (latest, segment) =>
        latest === undefined || segment.number > latest.number ? segment : latest,
      undefined,
    );
}
