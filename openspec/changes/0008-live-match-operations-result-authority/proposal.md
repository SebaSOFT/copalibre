## Why

Phase 7 gives every fixture a scheduled venue/time. Nothing yet lets an authorized official actually
run the match: record events, control the clock, or finalize a result — and nothing enforces
CopaLibre's central integrity promise once a result exists. `../chaos-vault/30-processes/decisions/
2026-07-27-copalibre-tournament-engine-mvp-and-result-authority.md`'s "Result authority" section is
unambiguous: "The MVP permits no direct overwrite of an outcome." `../chaos-vault/50-research/
copalibre-market-segment-feature-specification.md` lists TMS-006 (live match control and result
authority) and TMS-009 (authorized corrections and audit trail) as two of the six P0 release-gate
capabilities. This phase builds both together because they are one integrity boundary: the same
endpoints that record a result are the endpoints that must refuse to let it be silently rewritten.

## What Changes

- Implement `apps/api` match-control endpoints: start/pause/resume/finalize a match, record a
  segment/event per the discipline's event-definition registry (positive/negative/neutral event
  categories; segments are generic — game/set/map/half/quarter/period/lap/round/timed-interval, not
  hardcoded sport names), manage timers (including timed penalties with start/duration/affected
  actor/resolution as auditable state).
- Implement **match-scoped, capability-based authorization**: event entry, clock control, lineup
  selection, and match finalization are separate permissions, not a consequence of a generic
  organizer role — assignable to the `table official` / `referee` roles.
- Implement the **audited correction/supersession workflow**: a correction requires actor,
  timestamp, reason, prior state, and replacement state; it previews affected standings and future
  fixtures before commit (reusing phase 7's downstream-impact-preview pattern where applicable); it
  preserves the original fact and prior calculation trace; it blocks automatic propagation into an
  already-started downstream stage pending authorized resolution. No endpoint in this phase allows a
  direct overwrite of a calculated outcome.
- Implement **event-triggered notification rules**: threshold/cooldown-based in-console
  notifications (e.g. team-foul-count threshold crossing) evaluated immediately after an event is
  recorded and match state recalculated, idempotent so reconnects/refreshes/recalculation never
  duplicate an alert for the same threshold crossing.
- Wire match finalization to phase 6's advancement engine so a finalized result correctly unlocks
  downstream fixtures.
- Explicit non-goal: no console UI in this phase — this is the API/domain layer only. Phase 17
  (`0017-live-match-console-a4`) builds the operator-facing console against these endpoints.

## Capabilities

### New Capabilities
- `live-match-operations`: match-scoped authorized event/timer/segment recording and finalization,
  driven by a discipline's event-definition registry.
- `result-correction-authority`: the audited, no-direct-overwrite correction/supersession workflow
  for any previously calculated outcome.

### Modified Capabilities
(none)

## Impact

- **New files/dirs**: `apps/api/match-control/`, `packages/domain/events/` (event-definition
  registry, segment model), `packages/rules` extension for event-triggered notification rule
  evaluation (reuses phase 3's registry).
- **Depends on**: phase 5 (auth/policy layer, match-scoped capability checks build on it), phase 6
  (advancement engine), phase 7 (scheduled fixtures being operated), phase 4 (audit + outbox).
- **Unblocks**: phase 9 (worker consumes the outbox events this phase writes to recalculate
  projections), phase 10 (SSE emits the events this phase produces), phase 17 (the live match
  console UI operates entirely against these endpoints), phase 23 (`0023-multi-stage-progression`, P1,
  builds cross-stage advancement atop this phase's finalization contract).
