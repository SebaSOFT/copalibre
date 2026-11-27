import { useState } from 'react';
import type { MatchConsoleResponse } from '../../lib/api-client.js';
import {
  clockTimeInputOf,
  parseClockTime,
  reopenTargetOf,
  selectedSegmentOf,
  type ClockTimeDraft,
  typedClockTimeOf,
} from '../../lib/match-console.js';
import { segmentIdOf } from './match-console-model.js';

/** The typed clock draft, the segment picked in the console, and the reopen target, all for one match. */
export function useSegmentClockDraft(projection: MatchConsoleResponse) {
  // Only an explicit pick: until the operator names a segment, the console shows the one the
  // match is in, so it follows the match from one segment to the next.
  const [pickedSegmentId, setPickedSegmentId] = useState('');
  // What the operator typed into the time field, and for which segment. Until they type, the field
  // shows the selected segment's current time, so Correct never sends a value nobody entered.
  const [clockDraft, setClockDraft] = useState<ClockTimeDraft>();
  // The segment a reopen confirmation was opened for. It applies only while that segment stays the
  // selected, ended one, so the reason can never be sent to another segment.
  const [reopenOpenedFor, setReopenOpenedFor] = useState<string>();
  const [reopenReason, setReopenReason] = useState('');

  const selectedSegment = selectedSegmentOf(projection.segments, pickedSegmentId);
  const selectedSegmentId = segmentIdOf(selectedSegment);
  const reopenTarget = reopenTargetOf(projection.segments, reopenOpenedFor, selectedSegmentId);
  // A typed draft counts only while it belongs to the segment now selected. Otherwise the input
  // shows that segment's clock, and Apply clock stays unavailable until the operator types again.
  const typedClockTime = typedClockTimeOf(clockDraft, selectedSegmentId);
  const clockTimeInput = clockTimeInputOf(selectedSegment, typedClockTime);
  const correctedSeconds = parseClockTime(typedClockTime);
  return {
    clockDraft,
    clockTimeInput,
    correctedSeconds,
    pickedSegmentId,
    reopenOpenedFor,
    reopenReason,
    reopenTarget,
    selectedSegment,
    selectedSegmentId,
    setClockDraft,
    setPickedSegmentId,
    setReopenOpenedFor,
    setReopenReason,
  };
}
