## Context

By phase 8, tournaments have a working results/standings lifecycle within a single competition run,
but nothing models what happens after a tournament ends: it stays visible in active dashboards
forever, and there's no defined boundary between "still running" and "finished." TMS-014 asks for
that boundary plus a safe retention/archival policy. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Explicit, enforced lifecycle states with legal-transition checking.
- Archival that changes visibility only, never deletes authoritative data.
- Deletion is always an explicit, retention-gated, operator-initiated action.

**Non-Goals:**
- Does not define GDPR/regional-compliance-specific retention defaults — retention periods are
  operator-configurable, not prescribed by this phase.
- Does not change the export mechanism itself (phase 19) — only guarantees archived data remains
  eligible for it.

## Decisions

**Lifecycle state lives on the Tournament/Organization aggregate itself, not a separate tracking
table.** Keeps the state machine close to the aggregate whose invariants it governs (phase 2's
`packages/domain`), consistent with how mutation classes are already attached to configuration
objects rather than tracked externally.

**Archival changes visibility/indexing only — implemented as a query-time filter, not a data
migration.** An archived tournament's rows are not moved, copied, or transformed; "excluded from
default listings" is a filter condition (`state != archived`) applied at the projection/query layer
(phase 4's repositories), so archival is instant and reversible in principle (though "un-archiving"
is not itself a requirement of this phase — see Open Questions).

**Deletion is retention-gated and always explicit, never a cron job that deletes silently.** Matches
the product's "authoritative competition facts" invariant: even data eligible for deletion requires a
deliberate operator action, logged like any other mutation. The scheduler (phase 9) only computes and
surfaces *eligibility*, it never performs deletion itself.

## Open gates

None newly introduced by this phase from chaos-vault's list. One implementation-level open question
(not a chaos-vault gate) is noted below.

## Risks / Trade-offs

- [Risk] An operator archives a tournament prematurely (before it's actually complete) and loses
  visibility on active work. → Mitigation: archival is only a legal transition from "completed," never
  directly from "in progress" — the lifecycle state machine itself prevents this.
- [Risk] Retention-eligible-but-not-deleted data accumulates indefinitely if operators never act. →
  Mitigation: retention eligibility surfaces as an explicit notification/queue in control-web (not a
  silent background fact), similar to phase 24's pending-reports queue pattern.
- [Risk] Query-time filtering for archival could be forgotten in a new listing endpoint added later,
  leaking archived tournaments into an active view. → Mitigation: the "active only" filter lives in one
  shared repository method (phase 4's `packages/persistence`) that all listing endpoints must use,
  not duplicated per-endpoint.

## Open Questions

- Whether "un-archiving" (returning an archived tournament to a visible-but-completed state) is
  needed as an explicit legal transition, or whether archival is treated as one-way with deletion as
  the only further transition — does not change this phase's specs or task breakdown either way, since
  the state machine is designed to make adding that transition later a config change, not a rearchitecture.

## Migration Plan

N/A — additive; existing tournaments default to whatever lifecycle state matches their current
factual status (e.g., all results recorded → "completed") via a one-time backfill migration in
`apps/migrate`, not an automatic archival.
