## Context

Phase 6 produces a fixture graph with no time or place. This design covers how venues, officials,
and time slots get assigned to that graph safely, without ever letting the public surface (phases
12–13) see a half-published schedule.

## Goals / Non-Goals

**Goals:**
- Conflicts (venue, official, rest-rule) are caught before commit, never discovered after publish.
- A schedule publish is all-or-nothing.
- Rescheduling shows its blast radius before an operator commits to it.

**Non-Goals:**
- No live match state — this phase only assigns when/where, not who's winning.
- No venue/official *directory* management UI — this phase assumes venues/officials already exist
  as referenceable entities; a management screen is out of this phase's scope (fold into phase 14/18
  if not already covered).

## Decisions

**Conflict detection runs synchronously inside the same transaction as the assignment write, not as
an async post-check.** A synchronous check guarantees no conflicting schedule state is ever
persisted, even momentarily — consistent with phase 4's "domain mutation + audit + outbox in one
transaction" pattern. Alternative considered: optimistic write + async conflict scan — rejected
because it would allow a real double-booking to exist, even briefly, which is unacceptable for a
resource (a venue, a human official) that can't be in two places at once regardless of eventual
consistency.

**Atomic publication uses the same transaction boundary as phase 4's repositories, batched.** A
"publish this schedule" operation collects every assignment in the batch, validates every one
(conflict + rest-rule), and only commits if all pass — using one database transaction for the whole
batch, not one per assignment. This directly implements "no partially-applied schedule state ever
visible."

**Downstream-impact preview is a read-only dry run of the same validation path used for commit.**
Rather than maintaining a separate "preview" code path that could drift from actual commit
behavior, the preview endpoint runs the exact same conflict/rest-rule/downstream-reference
resolution logic as commit, but returns its findings instead of writing.

## Risks / Trade-offs

- [Risk] Rest-rule configuration varies by discipline and could be misconfigured to be either too
  strict (blocking valid schedules) or too permissive (allowing unsafe entrant fatigue). →
  Mitigation: rest-rule parameters are versioned configuration (consistent with phase 2's
  DisciplineDescriptor model), not hardcoded, and changes to them are audited like any other
  ruleset override.
- [Risk] Large batch publishes (many fixtures at once) could hold a long-running transaction. →
  Mitigation: not a concern at MVP tournament sizes; revisit only if measured contention appears.

## Migration Plan

N/A — first scheduling implementation, no prior state.
