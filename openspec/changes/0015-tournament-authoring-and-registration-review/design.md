## Context

Both screens' layouts already exist as static mockups
(`a2-tournament-setup-wizard/code.html`, `a3-registration-review/code.html`). The domain rules they
must respect — MVP format list, `DisciplineDescriptor→TournamentRuleset` hierarchy, mutation
classification — are fully specified in `../chaos-vault/30-processes/decisions/2026-07-27-copalibre-
tournament-engine-mvp-and-result-authority.md`. This design covers wiring the existing layouts to
that domain model and the control-web shell from phase 14, not inventing new UX.

## Goals / Non-Goals

**Goals:**
- The wizard can never produce a tournament with an unsupported format or a discipline/format
  mismatch — enforced at the UI layer as a first line of defense, backed by API-layer validation as
  the actual authority.
- Registration review's bulk actions are individually audited, not batched into one opaque audit
  entry, so `0018-roles-permissions-rbac` (phase 18) and any future dispute workflow can attribute each
  approval precisely.
- Eligibility lock is a real domain-state check (check-in window closed), not a client-side flag that
  a organizer could bypass by editing local state.

**Non-Goals:**
- No fixture generation triggered by wizard completion — publishing a tournament just creates its
  ruleset; `0006-tournament-engine-fixtures-mvp-formats` is what later generates fixtures from it.
- No participant self-service check-in flow — this phase is the organizer-side review only;
  participant-facing check-in UI is out of scope for this proposal (tracked implicitly under future
  participant-facing phases, not part of the P0 control-web set).
- No CSV import of registrations — that's `0019-csv-import-export-data-ownership` (phase 19).

## Decisions

**Format list is fetched from the API, not hardcoded in the wizard component**, even though it is
currently fixed to the six MVP formats. This keeps the UI's source of truth aligned with
`0002-domain-model-core`'s authoritative format list rather than requiring a coordinated frontend
deployment if the backend's supported-format list ever changes within MVP scope (e.g., a bug fix
narrows it further).

**Mutation-classification checks run client-side for UX (immediate feedback) but are re-validated
server-side as the actual authority.** The wizard shows a blocking dialog for a
`blocked_after_results` edit attempt before the API call is even made, but the API independently
rejects it regardless of what the client believes, consistent with never trusting client-side-only
enforcement for an integrity-critical rule.

**Bulk actions are implemented as N individual API calls (or one API call that internally produces N
audit records), never as a single opaque "bulk approve" audit fact.** This directly satisfies the
per-registration audit scenario in the spec and avoids an audit trail that can't answer "was
registration X specifically approved and by whom."

## Risks / Trade-offs

- [Risk] Client-side format/discipline filtering could drift from the API's actual validation rules
  if not kept in sync. → Mitigation: format list task in `tasks.md` explicitly fetches from the API
  rather than hardcoding, and an integration test asserts the wizard rejects whatever the API rejects.
- [Risk] N individual API calls for bulk actions could be slow for large registration batches. →
  Mitigation: out of scope for this phase's spec-level behavior (no volume requirement stated in
  chaos-vault); flagged for a future performance pass once real usage data exists.

## Open Questions

- Whether bulk actions are implemented as N client-side calls or one server-side batch endpoint that
  internally fans out to N audit records is an implementation detail — either satisfies the
  "individually audited" requirement and can be decided in `tasks.md` without touching the spec.
