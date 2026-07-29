## Why

TMS-014 ("Competition lifecycle and archival",
`../chaos-vault/50-research/copalibre-market-segment-feature-specification.md`) is P1: tournaments
and circuits need explicit lifecycle states (draft, published, in progress, completed, archived) and
a retention/archival policy, rather than remaining "live" forever or being deleted outright. This
closes the loop on the "data ownership" and "public/private separation" product invariants for
tournaments that have finished — archived data must remain queryable and exportable (per phase 19's
`data-portability` capability), not disappear.

## What Changes

- Add explicit **tournament and circuit lifecycle states**: draft → published → in progress →
  completed → archived, with defined legal transitions (e.g., a completed tournament cannot return to
  "in progress" without an authorized exception).
- Add **archival**: an operator can archive a completed tournament/circuit, which changes its default
  visibility/indexing (excluded from active dashboards and default public listings per the URL/sitemap
  contract) without deleting any authoritative data.
- Add **retention policy configuration**: how long archived data is retained before it becomes
  eligible for operator-initiated deletion (never automatic silent deletion of competitive history).
- Ensure archived tournaments remain **queryable and exportable** via phase 19's CSV export and the
  public route contract (an archived tournament's public page still resolves, just outside default
  "active" listings).

## Capabilities

### New Capabilities
- `competition-lifecycle`: explicit lifecycle states for tournaments/circuits, legal-transition
  enforcement, archival, and retention policy.

### Modified Capabilities
(none — the requirement that archived data stays exportable is expressed as a `competition-lifecycle`
requirement in this change's own spec, not as a modification to phase 19's `data-portability` spec,
since phase 19 has not yet been archived into a baseline `openspec/specs/data-portability/` this
change could diff against)

## Impact

- **Depends on**: phase 2 (`tournament-domain-model`) for the Tournament/Organization aggregates this
  adds states to, phase 12 (`public-web`) for the visibility/indexing behavior archival changes,
  phase 19 (`data-portability`) for the export path archived data must remain eligible for.
- **New files**: lifecycle-state machine in `packages/domain`, archival/retention endpoints in
  `apps/api`, a scheduled retention-eligibility check in `apps/scheduler`.
- P1 phase: deferred past MVP, fully specified here.
