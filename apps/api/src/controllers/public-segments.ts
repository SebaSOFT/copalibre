import {
  foldLiveScores,
  type DisciplineDescriptor,
  type RecordedEvent,
  type Segment,
} from '@copalibre/domain';
import type { PublicSegmentSummaryResponse } from '../dto/public-tournament.dto.js';

/**
 * A match's segments as a spectator reads them: which ones exist, whether each is over, being played
 * or still to come, and what each was worth to each side. A set of tennis is a segment that was
 * played to a target (`timed: false`) and scored by the events recorded during it; a half of
 * football is a segment that ran against a clock. Which of the two is the discipline's own
 * declaration, and so is the label, kept in every language it was written in for the viewer to pick.
 *
 * The score of a segment is the same fold that scores the match, applied to that segment's events
 * alone, so a segment's score and the match's can never disagree about what counts.
 */
export function segmentSummariesOf(
  descriptor: DisciplineDescriptor,
  segments: readonly Segment[],
  events: readonly RecordedEvent[],
  entrantIds: readonly [string | undefined, string | undefined],
): PublicSegmentSummaryResponse[] {
  const typeByName = new Map(descriptor.segmentTypes.map((type) => [type.name, type]));
  const sides = entrantIds.filter((id): id is string => id !== undefined);
  return [...segments]
    .sort((a, b) => a.number - b.number)
    .map((segment) => {
      const type = typeByName.get(segment.type);
      const scores =
        sides.length === 2
          ? foldLiveScores(
              descriptor,
              events.filter((event) => event.segmentId === segment.segmentId),
              sides,
            ).map((total) => total.score)
          : undefined;
      return {
        number: segment.number,
        type: segment.type,
        ...(type === undefined ? {} : { label: type.label, timed: type.timed }),
        state: segment.state,
        ...(scores === undefined ? {} : { scores }),
      };
    });
}
