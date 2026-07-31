import type { EventDefinition } from './event-definition.js';

/**
 * Core-owned event vocabulary for win-condition thresholds.
 *
 * Because segment progress passes through the rules engine, "one point from
 * closing the set" and "one point from closing the match" are ordinary events:
 * deuce, set point, match point and tiebreak-entered notifications reuse the
 * phase-3 event-triggered notification rules rather than needing a second
 * mechanism (0009 design). The codes are core-owned like the action registry —
 * a discipline includes them, it does not invent them.
 */

export const SEGMENT_THRESHOLD_EVENT_CODES = [
  'segment-point',
  'match-point',
  'margin-required',
  'tiebreak-entered',
] as const;

export type SegmentThresholdEventCode = (typeof SEGMENT_THRESHOLD_EVENT_CODES)[number];

const LABELS: Readonly<Record<SegmentThresholdEventCode, string>> = {
  'segment-point': 'Segment point',
  'match-point': 'Match point',
  'margin-required': 'Margin required',
  'tiebreak-entered': 'Tiebreak entered',
};

/**
 * The threshold event definitions for a discipline, recordable during the
 * segment types it declares — only the discipline knows what it subdivides a
 * match into.
 */
export function segmentThresholdEventDefinitions(
  permittedSegmentTypes: readonly string[],
): readonly EventDefinition[] {
  return SEGMENT_THRESHOLD_EVENT_CODES.map((code) => ({
    code,
    label: LABELS[code],
    // Neutral: a threshold states where the score is, and category must never
    // imply an effect — effects are configured explicitly or not at all (0002).
    category: 'neutral',
    permittedSegmentTypes: [...permittedSegmentTypes],
    actorRequirement: 'none',
    payloadSchema: {
      type: 'object',
      properties: {
        segmentType: { type: 'string' },
        segmentIndex: { type: ['number', 'null'] },
        entrantId: { type: ['string', 'null'] },
        threshold: { type: 'number' },
        values: { type: 'object' },
      },
      required: ['segmentType', 'threshold'],
    },
  }));
}
