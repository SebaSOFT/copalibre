## Context

The architecture doc's security-planes table already separates "Authenticated interaction"
(participant self-service) from "Admin/control" (organizer/official consoles) by authorization
policy, not transport — "a participant token and an organizer token look the same at the transport
layer and differ entirely at the policy layer." This phase implements that policy layer's first
concrete taxonomy. Reference UI: `../copalibre-design-system-fixed/a7-roles-permissions/code.html`.

## Goals / Non-Goals

**Goals:**
- Every authenticated endpoint checks resource-ownership/role policy, not just JWT validity.
- The four organization-scoped roles (admin/referee/broadcaster/viewer) are the initial taxonomy;
  match-scoped capabilities (from `0017-live-match-console-a4`) layer on top, not instead of, this model.

**Non-Goals:**
- No custom/per-organization role definitions in this phase — the four roles are fixed; a
  configurable-role system is a later enhancement if ever needed, not MVP scope.
- No SSO/identity-provider selection — that remains an explicit open gate in
  `copalibre-platform-architecture.md`, unaffected by this phase's role-taxonomy work.

## Decisions

**Coarse organization role plus fine match-scoped capability, not one flat permission list.** A
user's `referee` role is necessary but not sufficient to finalize a specific match — that also
requires a match-scoped grant (already specified in `0017-live-match-console-a4`'s authorization model).
This two-layer design avoids a combinatorial explosion of per-resource roles while still satisfying
the "match-scoped, capability-based" requirement from the tournament-engine decision doc. Alternative
considered: a single flat RBAC list scoped per-resource from the start — rejected as premature
complexity given only four roles are needed for MVP.

**Resource-ownership policy is enforced in the API policy layer, not the database.** Consistent with
the architecture doc's "Nest boundary" principle — Nest guards/policies adapt external input, not
`packages/domain`. Row-level database security is not used as the enforcement mechanism, keeping the
authorization logic testable and auditable in application code.

**Open gate carried forward, not resolved here**: `copalibre-platform-architecture.md` explicitly
leaves the identity provider unselected. This phase's role/permission model is IdP-agnostic — it
operates on the `org`/`scp` JWT claims regardless of which IdP issued the token — so it does not
block on that open gate, but does not resolve it either.

## Risks / Trade-offs

- [Risk] A missing authorization check on a new endpoint silently defaults to "allowed." → Mitigation:
  require every new controller route to declare an explicit role/ownership guard; add a lint/test
  rule that fails CI if a route has no guard decorator (deny-by-default posture).
- [Risk] Role taxonomy is too coarse for a future large federation with many staff types. → Mitigation:
  explicitly out of scope per Non-Goals; documented as a deferred extension point, not silently
  worked around with ad hoc flags.

## Migration Plan

N/A — first implementation of the role model; no prior authorization scheme exists to migrate from.
