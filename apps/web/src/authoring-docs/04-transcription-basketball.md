# Worked transcription: basketball

A two-sided, timed, segment-based discipline — informed by FIBA's published rules of basketball, not a
copy of their text. The full output descriptor is
[`basketball.descriptor.json`](/authoring/transcriptions/basketball.descriptor.json); this page states
the mapping decisions, clause by clause.

## Structural facts → descriptor shape

| Regulation clause                                                     | Declaration                                                                                                                                                                                                                   |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two teams, five players on court per side                             | `participantTypes: ["team"]`, `rosterConstraints: { minPlayers: 5, maxPlayers: 5, maxSubstitutes: 7 }`                                                                                                                        |
| Four 10-minute quarters, plus 5-minute overtime periods if tied       | `segmentTypes`: `quarter` (timed, 600s) and `overtime` (timed, 300s)                                                                                                                                                          |
| A team captain                                                        | `rosterRoles`: one role, `captain`                                                                                                                                                                                            |
| Field goals worth two or three points, free throws worth one          | Three event definitions (`field-goal-2pt`, `field-goal-3pt`, `free-throw-made`), each with a `score` effect of the matching `delta` and a `statistic` effect on `points`                                                      |
| An assisted score credits a second player                             | Each scoring event's payload carries an optional `assistedBy` player id; an `awardTo: { payloadField: "assistedBy" }` statistic effect credits `assists` to whoever it names — absent when unassisted, never a guess          |
| Rebounds, steals, turnovers, personal fouls are individually tracked  | One statistic each, `sum` aggregation; one event each with the matching statistic effect                                                                                                                                      |
| A team may substitute a player at any stoppage                        | `substitution` event, `actorRequirement: "side"`, with `personPayloadFields` naming the outgoing and incoming player so the console still prompts for a person on each without inventing a score/statistic effect neither has |
| Played across leagues, single- and double-elimination cup competition | `availableFormats: ["single-elimination", "double-elimination", "round-robin", "league"]`                                                                                                                                     |
| Highest score at the end of regulation (or overtime) wins             | `winCondition`: one `winMatch` action, `unit: "points"`, no `target` — closes on whoever leads once the recorded segments are complete                                                                                        |

## What could not be expressed

**A fifth personal foul disqualifies the player from the rest of the match.** The descriptor has no
"count reaches N, then refuse further participation" mechanism — `effects` only ever apply at the
instant an event is recorded, and nothing in the schema conditions one event's legality on a running
tally of another. `personal-foul` is declared and its statistic accumulates normally; enforcing the
disqualification-on-five-fouls rule is an operational decision the console operator makes when the
tally reaches five, using the ordinary correction/tag surfaces, not something this descriptor encodes
or enforces. **This is not an oversight of this transcription — it is a real, current limitation of the
descriptor's effect model**, worth stating rather than working around with an invented field.

**Overtime is played until a winner exists — never a draw.** `winMatch` with no target closes the match
whoever leads at the end of the _segments actually recorded_, and treats a level score as a drawn
match. Basketball never draws: real overtime keeps being played (5 more minutes, repeated) until it
isn't level. The descriptor cannot express "keep generating more segments until the tie breaks" —
that is an operational decision (the console operator starts another declared `overtime` segment)
rather than something `winCondition` schedules on its own. Declaring `overtime` as a segment type is
what makes recording it possible; nothing in the descriptor _requires_ it to happen, or bounds how
many overtime periods a match may need.
