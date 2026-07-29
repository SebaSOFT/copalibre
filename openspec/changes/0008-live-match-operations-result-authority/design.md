## Context

Phase 7 schedules matches; phase 6 can calculate results and advancement once given inputs; phase 5
gives an auth/policy boundary. Nothing yet lets an official *produce* those inputs safely, and
nothing enforces that a produced result can't be silently rewritten. This design covers both, as one
integrity boundary — they share the same endpoints and the same audit/outbox transaction pattern
from phase 4.

## Goals / Non-Goals

**Goals:**
- Every state change during a live match is an auditable fact, not an implicit side effect.
- A finalized result can only change through the correction workflow — no back door.
- Match-scoped permissions are granular enough that a broadcaster role can never accidentally
  finalize a match.

**Non-Goals:**
- No console UI — phase 17 builds the operator-facing screen against this phase's endpoints.
- No participant self-service reporting or disputes — explicitly P1 (phase 24), per the tournament-
  engine decision doc's Consequences section: "Participant reporting and participant-initiated
  disputes are not MVP scope. Authorized operator corrections with audit history are MVP scope."

## Decisions

**Match-scoped capability grants, not role-implied permissions.** A user's ability to finalize a
match is a distinct grant from their ability to record events, even for the same match — matching
the decision doc's explicit statement that these "are separate permissions rather than consequences
of a generic organizer role." Alternative considered: a single "referee" role bundling all four
capabilities — rejected because it can't express legitimate narrower assignments (e.g. a
broadcaster who needs read access plus notification visibility but must never finalize).

**Correction is a first-class domain operation, not a special-cased update path.** Rather than
adding an `isCorrection` flag to the ordinary result-write endpoint, corrections are a distinct
operation with their own request/response shape (prior state, replacement state, reason mandatory),
reusing phase 7's downstream-impact-preview pattern for the "preview before commit" requirement.
This keeps the ordinary write path simple (it never accepts a correction) and makes the correction
path impossible to reach accidentally.

**Blocked-propagation state is surfaced, not silently dropped.** When a correction can't
auto-propagate into an already-started downstream stage, the system records the conflict as an
explicit, queryable state (not just a rejected write) so an authorized user can see and resolve it
later — consistent with phase 4's audit model of always retaining prior states rather than deleting
information.

**Event-triggered notifications reuse phase 3's rule registry, evaluated synchronously after each
event write, inside the same transaction that records the event.** This keeps notification firing
tied to the exact same event-and-recalculation step it describes, and the idempotency requirement is
satisfied by keying delivered notifications on `(rule_id, threshold_crossing_id)` so a retry or
recalculation of the same crossing never re-fires.

## Risks / Trade-offs

- [Risk] Fine-grained match-scoped capability grants add administrative overhead for small
  organizers running one-person operations. → Mitigation: phase 18's roles/permissions UI should
  support granting all four capabilities in one action for the common case, while still enforcing
  them as separate permissions underneath.
- [Risk] Blocked-propagation conflicts left unresolved could accumulate and confuse standings. →
  Mitigation: phase 16's standings UI should surface an explicit "correction pending resolution"
  indicator wherever an unresolved blocked-propagation conflict affects the displayed standing.
- [Risk] Synchronous notification-rule evaluation inside the event-write transaction could slow
  down high-frequency event recording (e.g. rapid-fire events in a fast-paced discipline). →
  Mitigation: not a concern at MVP event volumes; revisit only if measured latency requires moving
  notification evaluation to an async worker step.

## Migration Plan

N/A — first implementation of match operations and correction authority.
