# Worked transcription: a track sprint

A placement discipline — no two sides, no match clock, one heat or final race per match, informed by
World Athletics' published competition rules, not a copy of their text. This transcription exists
specifically because a single duel example teaches an agent the wrong default: that every match has
two sides and a segment clock. It has neither. The full output descriptor is
[`track-sprint.descriptor.json`](/authoring/transcriptions/track-sprint.descriptor.json).

## Structural facts → descriptor shape

| Regulation clause                                                                     | Declaration                                                                                                                                                                          |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| One athlete races alone, not against a designated opponent                            | `participantTypes: ["individual"]`, `rosterConstraints: { minPlayers: 1, maxPlayers: 1 }`                                                                                            |
| A race has no periods or clock stoppages                                              | One `segmentTypes` entry, `race`, `timed: false`                                                                                                                                     |
| A false start is recorded against the athlete                                         | `false-start` event, `statistic` effect on `false-starts`                                                                                                                            |
| A disqualified athlete is removed from contention                                     | `disqualified` event, no score/statistic effect — see below                                                                                                                          |
| Multiple heats feed a final; a meet may also run a single final with everyone at once | `availableFormats: ["free-for-all", "heats"]`                                                                                                                                        |
| Result is ordered by finishing position, and separately by time                       | `placementScoring` maps 1st–8th to points (8 down to 1); a `time-seconds` statistic (`min` aggregation) records the fastest recorded time an athlete achieves across the competition |

## What could not be expressed

**A finish time is a measured value, not a tally.** Every `EventEffect` of kind `statistic` adds a
fixed `delta` to a running total — exactly right for counting goals or fouls, structurally wrong for
recording "this athlete's time was 10.31 seconds", a number that varies every occurrence and is never
summed with a previous one. The `finish` event is declared as a plain marker (no effect at all); the
actual time is entered as a match statistic (`OutcomeSide.statistics["time-seconds"]`) directly at
result finalization — an operator-entered value, which is exactly why `scoringInputs` declares
`time-seconds` as `source: "operator-entered"` rather than `event-derived`. **A discipline whose
measurements are continuous values, not event counts, records them at finalization, not through event
effects — this is a structural boundary of the descriptor, not a gap specific to track.**

**Disqualification for a false start is a ruling, not a formula.** Current rules disqualify an athlete
after any false start attributed to them. The descriptor declares `false-start` (an event, tallied) and
`disqualified` (a separate event, applied by the operator's own ruling) rather than an automatic
"first false start ⇒ disqualified" effect, because nothing in the effect model conditions one event's
occurrence on another's. This mirrors basketball's fifth-foul case exactly: a threshold-triggered status
change is an operational decision an operator applies, using the audited-correction and
`ResultReason: "disqualified"` vocabulary on the recorded outcome — never something an event's own
`effects` array encodes.

**`winCondition` is schema-required even though it does not decide a placement discipline's result.**
A placement match's actual ordering comes from each side's recorded `placement`, not from which side
"wins" a score comparison — there is no real winner/loser in an eight-athlete final. The schema still
requires a `winCondition` script unconditionally, so this descriptor declares a structurally-valid but
functionally vestigial one (`winMatch` on the placement-points statistic, no target) to satisfy the
requirement. Whether — and how — the engine consults this script for a placement-format match, versus
relying purely on recorded `placement`, is not settled by anything this descriptor itself states; an
agent authoring a placement discipline should treat this field as "present because required", not as
the mechanism that actually orders the result.
