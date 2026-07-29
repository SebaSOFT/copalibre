## Context

This is the UI layer over phase 8's match-control API and correction workflow, and phase 3's
discipline event-definition registry. The reference interaction shape is already established by the
"corrected" A4 mockup at `../copalibre-design-system-fixed/a4-live-match-operations-console/code.html`
and the "Live console workflow reference" in
`../chaos-vault/30-processes/decisions/2026-07-27-copalibre-tournament-engine-mvp-and-result-authority.md`
(user-supplied referee console screenshots are functional workflow evidence only, not a visual-copy
spec).

## Goals / Non-Goals

**Goals:**
- No path exists in the UI to overwrite a finalized result directly — only initiate the authorized
  correction workflow (phase 8).
- The console never presents an event type invalid for the current discipline/state/segment.
- Optimistic UI never silently diverges from authoritative server state.

**Non-Goals:**
- No new scoring/aggregation logic — all calculation is phase 3/6/8's responsibility; this phase only
  renders their output and forwards operator input.
- No generic "command console" free-text execution surface — explicitly rejected per the design
  system's own corrections log (A4 was reworded from "command console" to a plain log-note field).

## Decisions

**Finalize is a two-step, server-confirmed commit, not a client-only guard.** The confirmation dialog
is necessary but not sufficient: the finalize request itself must be idempotent server-side (an
idempotency key, consistent with the outbox/worker idempotency pattern from phase 9) so a network
retry after the dialog is confirmed cannot produce a duplicate commit. Alternative considered:
client-side disable-after-click only — rejected, since it does not survive a genuine network retry.

**Event palette is fully data-driven, zero per-sport UI branching in application code.** The palette,
labels, icons, colors, and input fields all come from the event-definition registry's presentation
metadata (already specified in the tournament-engine decision doc), consistent with the product's
"multi-discipline, not sport-shaped" principle from the CopaLibre README. No `if (discipline ===
'football')` branches are permitted in this capability's code.

**Optimistic updates are reconciled via the phase 10 SSE channel, not polling.** The console applies
an optimistic score update locally, then reconciles against the next authoritative SSE event for that
match; if no reconciling event arrives within a bounded timeout, the console shows a stale-data
indicator rather than trusting the optimistic value indefinitely.

## Risks / Trade-offs

- [Risk] A discipline-configuration bug could surface an invalid event type in the palette. →
  Mitigation: server-side validation is still authoritative — even if the palette shows something
  invalid due to a config bug, the API rejects an event not valid for the current state, and the UI
  surfaces that rejection clearly.
- [Risk] Double-submit protection relying only on UI disable-state is fragile under flaky networks. →
  Mitigation: idempotency key generated client-side per finalize attempt, checked server-side (phase
  8's responsibility; this phase's task list includes verifying that contract).
- [Risk] Reconciliation timeout tuned too aggressively could flash "stale" unnecessarily on normal
  network jitter; too lax could hide real staleness during an incident. → Mitigation: make the
  timeout a named, documented constant reviewed against phase 10's SSE heartbeat interval, not a
  guessed magic number.

## Migration Plan

N/A — new UI, no prior console to migrate from. Ships behind the existing control-app auth boundary
and match-scoped capability checks; a match official cannot reach this screen without the relevant
authorization regardless of feature completeness.
